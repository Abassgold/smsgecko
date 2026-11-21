import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Application } from 'express';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeCatalog, makeUser, simulateOtp } from './factories.js';
import { ApiKey } from '../models/ApiKey.js';
import { User } from '../models/User.js';
import { WebhookJob } from '../models/WebhookJob.js';
import { runWebhookRetries, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_RETRY_DELAYS_MS } from '../lib/webhooks.js';

/*
 * Webhook retries: a delivery counts only on a 2xx. Anything else is tried again, 5 more times at growing gaps, from a
 * queue kept in the database (so a restart loses nothing). Every attempt sends the same body and signature.
 */
let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});

/** A local receiver whose answer the test chooses, recording every request it gets. */
function receiver(answer: (n: number) => number | 'hang') {
  const requests: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c));
    req.on('end', () => {
      requests.push({ headers: req.headers, body });
      const a = answer(requests.length);
      if (a === 'hang') return; // never answers: the sender gives up at its timeout
      res.writeHead(a, a >= 300 && a < 400 ? { location: 'https://example.com/' } : {}).end('x');
    });
  });
  return {
    requests,
    listen: async () => {
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const addr = server.address();
      return `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/hook`;
    },
    close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

const open: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

/** A user with a webhook pointing at `url`, who has just received a code on a fresh order (queues one delivery). */
async function codeArrives(url: string) {
  const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 200_000, stock: 5 });
  const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
  await User.updateOne({ _id: userId }, { $set: { webhookUrl: url, webhookSecret: 's'.repeat(24) } });
  const { key } = await ApiKey.issue(userId, 'test');
  const created = await inject({ method: 'POST', url: '/api/v2/orders', headers: { authorization: `Bearer ${key}` }, payload: { catalog_product_id: `${serviceCode}::${countryCode}` } });
  await simulateOtp(created.json().data.id as string);
  await vi.waitFor(async () => expect(await WebhookJob.countDocuments({ userId })).toBe(1));
  return { userId };
}

/** Make every waiting job due now (instead of really waiting minutes), then run the worker once. */
async function nextRound() {
  await WebhookJob.updateMany({ status: 'pending' }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await runWebhookRetries();
}
const job = async (userId: string) => (await WebhookJob.findOne({ userId }))!;
/** The first attempt runs in the background right after the code arrives: wait until its result has been saved. */
const firstAttemptSaved = (userId: string) =>
  vi.waitFor(async () => {
    const j = await job(userId);
    expect(j.lastStatusCode !== null || j.lastError !== null || j.status !== 'pending').toBe(true);
  });

describe('webhook retries', () => {
  it('delivers on the first try when the receiver answers 2xx, and does not retry', async () => {
    const r = receiver(() => 204); // any 2xx counts, not just 200
    open.push(r);
    const { userId } = await codeArrives(await r.listen());
    await firstAttemptSaved(userId);
    expect((await job(userId)).status).toBe('delivered');
    await nextRound();
    expect(r.requests).toHaveLength(1);
    expect((await job(userId)).attempts).toBe(1);
  });

  it('retries until the receiver answers 2xx, then stops', async () => {
    const r = receiver((n) => (n < 3 ? 500 : 200));
    open.push(r);
    const { userId } = await codeArrives(await r.listen());
    await firstAttemptSaved(userId);
    expect((await job(userId)).status).toBe('pending');
    await nextRound();
    expect((await job(userId)).status).toBe('pending');
    await nextRound();
    expect((await job(userId)).status).toBe('delivered');
    await nextRound(); // nothing left to send
    expect(r.requests).toHaveLength(3);
    expect((await job(userId)).attempts).toBe(3);
  });

  it('gives up after the first try plus 5 retries when the receiver never answers 2xx', async () => {
    const r = receiver(() => 500);
    open.push(r);
    const { userId } = await codeArrives(await r.listen());
    await firstAttemptSaved(userId);
    for (let i = 0; i < 8; i++) await nextRound();
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(6);
    expect(r.requests).toHaveLength(6);
    const j = await job(userId);
    expect(j.status).toBe('failed');
    expect(j.lastStatusCode).toBe(500);
    expect(j.doneAt).not.toBeNull();
  });

  it('waits longer each time: 10s, 1m, 5m, 30m, 2h', async () => {
    expect(WEBHOOK_RETRY_DELAYS_MS).toEqual([10_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]);
    const r = receiver(() => 500);
    open.push(r);
    const { userId } = await codeArrives(await r.listen());
    await firstAttemptSaved(userId);
    for (let i = 0; i < WEBHOOK_RETRY_DELAYS_MS.length; i++) {
      const j = await job(userId);
      const wait = j.nextAttemptAt.getTime() - j.updatedAt.getTime();
      expect(Math.abs(wait - WEBHOOK_RETRY_DELAYS_MS[i]!)).toBeLessThan(2000);
      await nextRound();
    }
  });

  it('a redirect or a 4xx is not a delivery', async () => {
    for (const status of [301, 404]) {
      const r = receiver(() => status);
      open.push(r);
      const { userId } = await codeArrives(await r.listen());
      await firstAttemptSaved(userId);
      expect((await job(userId)).status).toBe('pending');
      expect((await job(userId)).lastStatusCode).toBe(status);
    }
  });

  it('every attempt sends the same body, the same signature and the same delivery id, with the attempt number counting up', async () => {
    const r = receiver((n) => (n < 3 ? 503 : 200));
    open.push(r);
    const { userId } = await codeArrives(await r.listen());
    await firstAttemptSaved(userId);
    await nextRound();
    await nextRound();
    expect(r.requests).toHaveLength(3);
    const [a, b, c] = r.requests;
    expect(b!.body).toBe(a!.body);
    expect(c!.body).toBe(a!.body);
    const sig = `sha256=${createHmac('sha256', 's'.repeat(24)).update(a!.body).digest('hex')}`;
    for (const x of r.requests) expect(x.headers['x-smsgecko-signature']).toBe(sig);
    expect(a!.headers['x-smsgecko-delivery']).toBe(String((await job(userId))._id));
    expect(b!.headers['x-smsgecko-delivery']).toBe(a!.headers['x-smsgecko-delivery']);
    expect(r.requests.map((x) => x.headers['x-smsgecko-attempt'])).toEqual(['1', '2', '3']);
  });

  it('survives a restart: the waiting retry is in the database, and a retry for a removed webhook is dropped', async () => {
    const r = receiver(() => 500);
    open.push(r);
    const { userId } = await codeArrives(await r.listen());
    await firstAttemptSaved(userId);
    // "Restart": nothing in memory is needed. A fresh worker tick finds the job in the database.
    expect(await WebhookJob.countDocuments({ userId, status: 'pending' })).toBe(1);
    await User.updateOne({ _id: userId }, { $set: { webhookUrl: null, webhookSecret: null } });
    await nextRound();
    expect(r.requests).toHaveLength(1); // nothing more was sent
    expect((await job(userId)).status).toBe('failed');
  });

  it('a receiver that never answers is retried too, and never blocks the order', async () => {
    const r = receiver(() => 'hang');
    open.push(r);
    const t0 = Date.now();
    const { userId } = await codeArrives(await r.listen());
    expect(Date.now() - t0).toBeLessThan(5000); // the order flow did not wait on the receiver
    await vi.waitFor(async () => expect((await job(userId)).lastError).toBeTruthy(), { timeout: 9000 });
    expect((await job(userId)).status).toBe('pending');
  }, 20_000);
});
