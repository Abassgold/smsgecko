import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeUser } from './factories.js';
import { env } from '../config/env.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { Order } from '../models/Order.js';
import { applyOtpToOrder } from '../lib/orderLifecycle.js';
import { notifyUser, removeSubscription, saveSubscription, sender } from '../services/push.service.js';
import { Types } from 'mongoose';

/*
 * Web push when a code arrives (ported from Mane SMS). Nothing here reaches a real push service: the one network call
 * (`sender.send`) is replaced. A push must never delay or fail the order that triggered it.
 */
let app: Application;
let inject: ReturnType<typeof makeInject>;
const send = vi.spyOn(sender, 'send');

beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
beforeEach(() => {
  env.VAPID_PUBLIC_KEY = 'pub';
  env.VAPID_PRIVATE_KEY = 'priv';
  send.mockReset();
  send.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
});
afterEach(() => {
  env.VAPID_PUBLIC_KEY = undefined;
  env.VAPID_PRIVATE_KEY = undefined;
});

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'k', auth: 'a' } });
const payload = { title: 't', body: 'b', url: '/x' };

describe('push subscriptions', () => {
  it('sends to every device of the user and only that user', async () => {
    const a = await makeUser(app);
    const b = await makeUser(app);
    await saveSubscription(a.userId, sub('https://push.test/1'));
    await saveSubscription(a.userId, sub('https://push.test/2'));
    await saveSubscription(b.userId, sub('https://push.test/3'));
    await notifyUser(a.userId, payload);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('re-pointing an endpoint to another account keeps one row', async () => {
    const a = await makeUser(app);
    const b = await makeUser(app);
    await saveSubscription(a.userId, sub('https://push.test/1'));
    await saveSubscription(b.userId, sub('https://push.test/1'));
    expect(await PushSubscription.countDocuments()).toBe(1);
    expect((await PushSubscription.findOne())!.userId.toString()).toBe(b.userId);
  });

  it('drops a subscription the push service reports gone (410), and keeps one that merely failed', async () => {
    const a = await makeUser(app);
    await saveSubscription(a.userId, sub('https://push.test/gone'));
    await saveSubscription(a.userId, sub('https://push.test/flaky'));
    send.mockImplementation(async (s) => {
      if (s.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      throw Object.assign(new Error('busy'), { statusCode: 503 });
    });
    await notifyUser(a.userId, payload);
    expect((await PushSubscription.find()).map((s) => s.endpoint)).toEqual(['https://push.test/flaky']);
  });

  it("unsubscribe only removes the caller's own device", async () => {
    const a = await makeUser(app);
    const b = await makeUser(app);
    await saveSubscription(a.userId, sub('https://push.test/1'));
    await removeSubscription(b.userId, 'https://push.test/1');
    expect(await PushSubscription.countDocuments()).toBe(1);
  });

  it('does nothing, and never throws, when push is not configured', async () => {
    env.VAPID_PRIVATE_KEY = undefined;
    const a = await makeUser(app);
    await saveSubscription(a.userId, sub('https://push.test/1'));
    await expect(notifyUser(a.userId, payload)).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('push routes', () => {
  it('need a signed-in user', async () => {
    expect((await inject({ method: 'GET', url: '/api/v1/push/config' })).statusCode).toBe(401);
  });

  it('tell the browser whether push is on, and give the public key only then', async () => {
    const { cookie } = await makeUser(app);
    expect((await inject({ method: 'GET', url: '/api/v1/push/config', headers: { cookie } })).json()).toEqual({ enabled: true, publicKey: 'pub' });
    env.VAPID_PUBLIC_KEY = undefined;
    expect((await inject({ method: 'GET', url: '/api/v1/push/config', headers: { cookie } })).json()).toEqual({ enabled: false, publicKey: null });
  });

  it('subscribe and unsubscribe a device, and refuse a malformed subscription', async () => {
    const { cookie, userId } = await makeUser(app);
    const subscribe = (body: object) => inject({ method: 'POST', url: '/api/v1/push/subscribe', headers: { cookie }, payload: body });
    expect((await subscribe(sub('https://push.test/me'))).statusCode).toBe(204);
    expect(await PushSubscription.countDocuments({ userId })).toBe(1);
    expect((await subscribe({ endpoint: 'not a url', keys: { p256dh: 'k', auth: 'a' } })).statusCode).toBe(400);
    expect((await subscribe({ endpoint: 'https://push.test/x' })).statusCode).toBe(400);
    expect((await inject({ method: 'POST', url: '/api/v1/push/unsubscribe', headers: { cookie }, payload: { endpoint: 'https://push.test/me' } })).statusCode).toBe(204);
    expect(await PushSubscription.countDocuments({ userId })).toBe(0);
  });
});

describe('a code arriving', () => {
  async function waitingOrder(userId: string) {
    return Order.create({
      userId: new Types.ObjectId(userId),
      serviceId: 'wa',
      countryId: 'us',
      serviceSlug: 'wa',
      serviceName: 'WhatsApp',
      countryName: 'United States',
      countryCode: '1',
      countryFlagEmoji: '🇺🇸',
      phoneNumber: '+15550100',
      priceMicro: 250_000,
      provider: 'tiger_sms',
      providerLabel: 'tiger-sms',
      providerRef: 'ref-1',
      status: 'waiting',
      source: 'web',
      expiresAt: new Date(Date.now() + 600_000),
    });
  }

  it('sends a push to the user\'s devices with the code, and the order still completes', async () => {
    const { userId } = await makeUser(app);
    await saveSubscription(userId, sub('https://push.test/1'));
    const order = await waitingOrder(userId);
    const done = await applyOtpToOrder(order, '123456', [{ sender: 'WhatsApp', text: 'Your code is 123456' }]);
    expect(done!.status).toBe('completed');
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(JSON.parse(send.mock.calls[0]![1])).toMatchObject({ title: 'WhatsApp: 123456', body: 'SMS received for +15550100' });
  });

  it('a push service that is down never fails or delays the order', async () => {
    const { userId } = await makeUser(app);
    await saveSubscription(userId, sub('https://push.test/1'));
    send.mockRejectedValue(new Error('push service down'));
    const order = await waitingOrder(userId);
    const done = await applyOtpToOrder(order, '654321', [{ sender: 'WhatsApp', text: 'code 654321' }]);
    expect(done!.status).toBe('completed');
  });
});
