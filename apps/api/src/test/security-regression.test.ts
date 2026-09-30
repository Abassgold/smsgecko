/**
 * Security regression tests (added 2026-09-30 after an audit).
 *
 *  1. The inbound SMS webhook must reject callers without the shared secret,
 *     so an anonymous caller can no longer forge an OTP / force-complete an
 *     order — while a forwarder that sends the secret still delivers.
 *  2. Order access stays user-scoped (no IDOR).
 *  3. /api/v2 checks the API key before touching the body.
 *
 * Run: npx vitest run --root apps/api src/test/security-audit.poc.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeCatalog, makeUser } from './factories.js';
import { Order } from '../models/Order.js';
import { isPrivateIp, isSafeWebhookUrl } from '../lib/webhooks.js';

const INBOUND_SECRET = 'test-inbound-secret-value';

let app: Application;
let inject: ReturnType<typeof makeInject>;
let prevSecret: string | undefined;

beforeAll(async () => {
  // The middleware reads process.env at call time — set the locked-down state.
  prevSecret = process.env.SMS_INBOUND_SECRET;
  process.env.SMS_INBOUND_SECRET = INBOUND_SECRET;
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(() => {
  if (prevSecret === undefined) delete process.env.SMS_INBOUND_SECRET;
  else process.env.SMS_INBOUND_SECRET = prevSecret;
});

async function placeWaitingOrder() {
  const { service, country } = await makeCatalog({ priceMicro: 250_000, stock: 5 });
  const { cookie } = await makeUser(app, { balanceMicro: 1_000_000 });
  const buy = await inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: { cookie },
    payload: { serviceId: service.id, countryId: country.id },
  });
  expect(buy.statusCode).toBe(201);
  const orderId = (buy.json() as { id: string }).id;
  const providerRef = (await Order.findById(orderId))!.providerRef;
  return { orderId, providerRef };
}

describe('SECURITY: inbound SMS webhook requires the shared secret', () => {
  it('rejects an anonymous caller with no secret — order is NOT completed', async () => {
    const { orderId, providerRef } = await placeWaitingOrder();

    const attack = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/sms',
      payload: { activationId: providerRef, code: '000000' },
    });

    expect(attack.statusCode).toBe(401);
    const order = await Order.findById(orderId);
    expect(order!.status).toBe('waiting'); // forged OTP was refused
    expect(order!.otpCode ?? null).toBeNull();
  });

  it('rejects a wrong secret', async () => {
    const { orderId, providerRef } = await placeWaitingOrder();
    const attack = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/sms',
      headers: { 'x-webhook-secret': 'not-the-secret' },
      payload: { activationId: providerRef, code: '111111' },
    });
    expect(attack.statusCode).toBe(401);
    expect((await Order.findById(orderId))!.status).toBe('waiting');
  });

  it('accepts a forwarder that sends the correct secret and delivers the code', async () => {
    const { orderId, providerRef } = await placeWaitingOrder();
    const ok = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/sms',
      headers: { 'x-webhook-secret': INBOUND_SECRET },
      payload: { activationId: providerRef, code: '482913' },
    });
    expect(ok.statusCode).toBe(200);
    const order = await Order.findById(orderId);
    expect(order!.status).toBe('completed');
    expect(order!.otpCode).toBe('482913');
  });
});

describe('SECURITY: order access is user-scoped (no IDOR)', () => {
  it('a second user cannot read the first user’s order', async () => {
    const { orderId } = await placeWaitingOrder();
    const attacker = await makeUser(app, { balanceMicro: 0 });
    const peek = await inject({
      method: 'GET',
      url: `/api/v1/orders/${orderId}`,
      headers: { cookie: attacker.cookie },
    });
    expect(peek.statusCode).toBe(404);
  });
});

describe('SECURITY: webhook SSRF guards', () => {
  it('flags private / link-local / loopback IPs (v4 + v6, incl. metadata)', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:169.254.169.254']) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });

  it('set-time URL check rejects http, loopback and metadata literals', () => {
    expect(isSafeWebhookUrl('https://example.com/hook')).toBe(true);
    expect(isSafeWebhookUrl('http://example.com/hook')).toBe(false);
    expect(isSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafeWebhookUrl('https://127.0.0.1/hook')).toBe(false);
  });
});

describe('SECURITY: /api/v2 checks the API key before the body', () => {
  it('rejects a bad bearer key (and never honours injected fields)', async () => {
    const bad = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: 'Bearer smsg_live_not_a_real_key' },
      payload: { catalog_product_id: 'wa::us', quantity: 999, balanceMicro: 999999999 },
    });
    expect(bad.statusCode).toBe(401);
  });
});
