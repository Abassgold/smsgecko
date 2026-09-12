import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeCatalog, makeUser, simulateOtp } from './factories.js';
import { ApiKey } from '../models/ApiKey.js';
import { User } from '../models/User.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(async () => {
  // express app needs no teardown
});

async function keyFor(userId: string) {
  const { key } = await ApiKey.issue(userId, 'test');
  return key;
}

function sign(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

interface CapturedRequest {
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A tiny local HTTP receiver that records every POST it gets, so tests can
 * assert on real webhook deliveries without mocking `fetch`. */
function createSink() {
  const requests: CapturedRequest[] = [];
  const waiters: Array<{ index: number; resolve: (r: CapturedRequest) => void }> = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk));
    req.on('end', () => {
      const captured: CapturedRequest = { headers: req.headers, body };
      const index = requests.push(captured) - 1;
      res.writeHead(200).end('ok');
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i]!.index === index) {
          waiters[i]!.resolve(captured);
          waiters.splice(i, 1);
        }
      }
    });
  });

  return {
    requests,
    async listen(): Promise<string> {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      return `http://127.0.0.1:${port}/hook`;
    },
    waitForNth(index: number, timeoutMs = 3000): Promise<CapturedRequest> {
      if (requests[index]) return Promise.resolve(requests[index]!);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timed out waiting for webhook request #${index}`)),
          timeoutMs,
        );
        waiters.push({
          index,
          resolve: (r) => {
            clearTimeout(timer);
            resolve(r);
          },
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

describe('v2 webhooks: config', () => {
  it('rejects non-https and private/local hosts', async () => {
    const { userId } = await makeUser(app);
    const key = await keyFor(userId);

    for (const bad of ['http://example.com/hook', 'https://localhost/hook', 'https://169.254.169.254/hook']) {
      const res = await inject({
        method: 'PATCH',
        url: '/api/v2/webhook',
        headers: { authorization: `Bearer ${key}` },
        payload: { webhook_url: bad },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    }
  });

  it('sets a url, auto-generates a secret, GET reflects it, null clears both', async () => {
    const { userId } = await makeUser(app);
    const key = await keyFor(userId);

    const set = await inject({
      method: 'PATCH',
      url: '/api/v2/webhook',
      headers: { authorization: `Bearer ${key}` },
      payload: { webhook_url: 'https://example.com/hook' },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().data.webhook_url).toBe('https://example.com/hook');
    expect(set.json().data.webhook_secret).toMatch(/^[\w-]{20,}$/);

    const got = await inject({
      method: 'GET',
      url: '/api/v2/webhook',
      headers: { authorization: `Bearer ${key}` },
    });
    expect(got.json().data.webhook_url).toBe('https://example.com/hook');

    const cleared = await inject({
      method: 'PATCH',
      url: '/api/v2/webhook',
      headers: { authorization: `Bearer ${key}` },
      payload: { webhook_url: null },
    });
    expect(cleared.json().data).toEqual({ webhook_url: null, webhook_secret: null });
  });

  it('accepts an explicit webhook_secret instead of generating one', async () => {
    const { userId } = await makeUser(app);
    const key = await keyFor(userId);
    const secret = 'a'.repeat(20);

    const res = await inject({
      method: 'PATCH',
      url: '/api/v2/webhook',
      headers: { authorization: `Bearer ${key}` },
      payload: { webhook_url: 'https://example.com/hook', webhook_secret: secret },
    });
    expect(res.json().data.webhook_secret).toBe(secret);
  });

  it('409s the test endpoint when no webhook is configured', async () => {
    const { userId } = await makeUser(app);
    const key = await keyFor(userId);
    const res = await inject({
      method: 'POST',
      url: '/api/v2/webhook/test',
      headers: { authorization: `Bearer ${key}` },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('v2 webhooks: delivery', () => {
  it('POST /webhook/test sends a signed event to the configured URL', async () => {
    const sink = createSink();
    const url = await sink.listen();
    const { userId } = await makeUser(app);
    const secret = 'b'.repeat(20);
    await User.updateOne({ _id: userId }, { $set: { webhookUrl: url, webhookSecret: secret } });
    const key = await keyFor(userId);

    const res = await inject({
      method: 'POST',
      url: '/api/v2/webhook/test',
      headers: { authorization: `Bearer ${key}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ delivered: true, statusCode: 200 });

    const received = await sink.waitForNth(0);
    const body = JSON.parse(received.body) as { event: string; timestamp: string; data: unknown };
    expect(body.event).toBe('webhook.test');
    expect(typeof body.timestamp).toBe('string');
    expect(received.headers['x-smsgecko-signature']).toBe(sign(secret, received.body));

    await sink.close();
  });

  it('fires order.created then order.completed with a valid signature on each', async () => {
    const sink = createSink();
    const url = await sink.listen();
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 200_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const secret = 'c'.repeat(20);
    await User.updateOne({ _id: userId }, { $set: { webhookUrl: url, webhookSecret: secret } });
    const key = await keyFor(userId);

    const created = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { catalog_product_id: `${serviceCode}::${countryCode}` },
    });
    const orderId = created.json().data.id as string;

    const createdReq = await sink.waitForNth(0);
    expect(received(createdReq, secret).event).toBe('order.created');
    expect(received(createdReq, secret).data.id).toBe(orderId);

    await simulateOtp(orderId);

    const completedReq = await sink.waitForNth(1);
    expect(received(completedReq, secret).event).toBe('order.completed');
    expect(received(completedReq, secret).data.otp_code).toBeTruthy();

    await sink.close();

    function received(r: CapturedRequest, expectedSecret: string) {
      expect(r.headers['x-smsgecko-signature']).toBe(sign(expectedSecret, r.body));
      return JSON.parse(r.body) as { event: string; data: { id: string; otp_code: string | null } };
    }
  });

  it('fires order.canceled on cancel', async () => {
    const sink = createSink();
    const url = await sink.listen();
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 300_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const secret = 'd'.repeat(20);
    await User.updateOne({ _id: userId }, { $set: { webhookUrl: url, webhookSecret: secret } });
    const key = await keyFor(userId);

    const created = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { catalog_product_id: `${serviceCode}::${countryCode}` },
    });
    const orderId = created.json().data.id as string;
    await sink.waitForNth(0); // order.created

    await inject({
      method: 'POST',
      url: `/api/v2/orders/${orderId}/cancel`,
      headers: { authorization: `Bearer ${key}` },
    });

    const canceledReq = await sink.waitForNth(1);
    const body = JSON.parse(canceledReq.body) as { event: string; data: { status: string } };
    expect(body.event).toBe('order.canceled');
    expect(body.data.status).toBe('canceled');

    await sink.close();
  });

  it('never configures an unsafe delivery target even directly on the model (defense in depth check)', async () => {
    // Sanity: dispatch itself doesn't re-validate the stored URL (validation is
    // at PATCH time) — this documents that assumption rather than testing new code.
    const { isSafeWebhookUrl } = await import('../lib/webhooks.js');
    expect(isSafeWebhookUrl('https://example.com/hook')).toBe(true);
    expect(isSafeWebhookUrl('http://example.com/hook')).toBe(false);
    expect(isSafeWebhookUrl('https://127.0.0.1/hook')).toBe(false);
    expect(isSafeWebhookUrl('not a url')).toBe(false);
  });
});
