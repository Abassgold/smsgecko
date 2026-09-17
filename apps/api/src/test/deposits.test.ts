import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeUser } from './factories.js';
import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { Deposit } from '../models/Deposit.js';

// Matches the dummy BACHS_WEBHOOK_SECRET in .env.test.
const BACHS_SECRET = 'bachs_whsec_dummy_not_real';

let app: Application;
let inject: ReturnType<typeof makeInject>;

/**
 * Fakes the real gateways' HTTP responses. The whole point of these tests is
 * to exercise the real createCharge()/webhook code paths end to end —
 * there's no mock provider to fall back to any more — without ever placing
 * an actual network call. Each fake id is unique per call (Deposit.providerRef
 * has a unique index — a real gateway would never hand back the same
 * reference twice either).
 */
function stubGatewayFetch() {
  let n = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
    n += 1;
    if (url.includes('api.stripe.com')) {
      return jsonResponse({
        id: `cs_test_${n}`,
        url: `https://checkout.stripe.com/pay/cs_test_${n}`,
      });
    }
    if (url.includes('bachs.io')) {
      return jsonResponse({
        checkout_id: `chk_${n}`,
        checkout_url: `https://checkout.bachs.io/c/${n}`,
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
    }
    if (url.includes('nowpayments.io')) {
      return jsonResponse({ id: `inv_${n}`, invoice_url: `https://nowpayments.io/payment/inv_${n}` });
    }
    throw new Error(`unexpected fetch() in test: ${url}`);
  });
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/** Signs a Bachs webhook body the same way `verifyBachsSignature` expects:
 * HMAC-SHA256("{timestamp}.{raw_body}"), as the X-Bachs-Signature-V2 header
 * `t=<timestamp>,v1=<signature>`. */
function signBachs(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac('sha256', BACHS_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/** Deposit creation is throttled (1.5s) to guard against a double-click
 * opening two checkout sessions — tests that legitimately create several
 * deposits for one user (simulating deposits made at different times, not
 * a rapid double-click) need to actually wait past that window. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bachsCollectionEvent(checkoutId: string, type = 'collection.succeeded') {
  return {
    id: 'evt_test_1',
    type,
    created_at: new Date().toISOString(),
    organization_id: 'acct_test',
    data: { charge_id: 'ch_test_1', checkout_id: checkoutId, status: 'succeeded', amount: '10.00', currency: 'USD' },
  };
}

beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(async () => {
  // express app needs no teardown
});

describe('deposits', () => {
  beforeEach(() => {
    stubGatewayFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a pending deposit, confirms once via the real webhook, and credits the wallet', async () => {
    const { cookie, userId } = await makeUser(app);
    expect((await User.findById(userId))!.balanceMicro).toBe(0);

    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'bachs', amountMicro: 10_000_000 },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().status).toBe('pending');
    const deposit = await Deposit.findById(create.json().id);

    const body = bachsCollectionEvent(deposit!.providerRef);
    const raw = JSON.stringify(body);
    const hook = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/bachs',
      headers: { 'x-bachs-signature-v2': signBachs(raw) },
      payload: body,
    });
    expect(hook.statusCode).toBe(200);

    expect((await User.findById(userId))!.balanceMicro).toBe(10_000_000);
    const tx = await Transaction.findOne({ userId, type: 'deposit' });
    expect(tx!.amountMicro).toBe(10_000_000);
    expect(tx!.balanceAfterMicro).toBe(10_000_000);

    // A second delivery of the same webhook is a silent no-op — no double credit.
    const again = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/bachs',
      headers: { 'x-bachs-signature-v2': signBachs(raw) },
      payload: body,
    });
    expect(again.statusCode).toBe(200);
    expect((await User.findById(userId))!.balanceMicro).toBe(10_000_000);
  });

  it('card deposits get Stripe\'s own hosted checkout URL — never an internal placeholder', async () => {
    const { cookie } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'card', amountMicro: 5_000_000 },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().payUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const deposit = await Deposit.findById(create.json().id);
    expect(deposit!.provider).toBe('stripe');
  });

  it('crypto_usdt deposits get NowPayments\' own hosted invoice URL', async () => {
    const { cookie } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'crypto_usdt', amountMicro: 5_000_000 },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().payUrl).toMatch(/^https:\/\/nowpayments\.io\/payment\//);
    const deposit = await Deposit.findById(create.json().id);
    expect(deposit!.provider).toBe('nowpayments');
  });

  it('bachs deposits get Bachs\' own hosted checkout URL', async () => {
    const { cookie } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'bachs', amountMicro: 5_000_000 },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().payUrl).toMatch(/^https:\/\/checkout\.bachs\.io\//);
    const deposit = await Deposit.findById(create.json().id);
    expect(deposit!.provider).toBe('bachs');
  });

  it('lists a user\'s own deposits, newest first, paginated', async () => {
    const { cookie } = await makeUser(app);
    const other = await makeUser(app);

    for (const amountMicro of [1_000_000, 2_000_000, 3_000_000]) {
      await inject({
        method: 'POST',
        url: '/api/v1/deposits',
        headers: { cookie },
        payload: { method: 'card', amountMicro },
      });
      await sleep(1600); // clear the per-user throttle before the next one
    }
    // Another user's deposit must not leak into this list.
    await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie: other.cookie },
      payload: { method: 'card', amountMicro: 9_000_000 },
    });

    const page1 = await inject({
      method: 'GET',
      url: '/api/v1/deposits?page=1&limit=2',
      headers: { cookie },
    });
    expect(page1.statusCode).toBe(200);
    expect(page1.json().total).toBe(3);
    expect(page1.json().totalPages).toBe(2);
    expect(page1.json().items).toHaveLength(2);
    expect(page1.json().items[0].amountMicro).toBe(3_000_000);
    expect(page1.json().items[1].amountMicro).toBe(2_000_000);

    const page2 = await inject({
      method: 'GET',
      url: '/api/v1/deposits?page=2&limit=2',
      headers: { cookie },
    });
    expect(page2.json().items).toHaveLength(1);
    expect(page2.json().items[0].amountMicro).toBe(1_000_000);
  });

  it('filters by status and reports stable per-status counts', async () => {
    const { cookie } = await makeUser(app);

    const confirmed = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'bachs', amountMicro: 1_000_000 },
    });
    const confirmedDeposit = await Deposit.findById(confirmed.json().id);
    const body = bachsCollectionEvent(confirmedDeposit!.providerRef);
    const raw = JSON.stringify(body);
    await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/bachs',
      headers: { 'x-bachs-signature-v2': signBachs(raw) },
      payload: body,
    });
    await sleep(1600); // clear the per-user throttle before the second deposit
    await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'card', amountMicro: 2_000_000 },
    });

    const all = await inject({ method: 'GET', url: '/api/v1/deposits', headers: { cookie } });
    expect(all.json().items).toHaveLength(2);
    expect(all.json().counts).toEqual({
      all: 2,
      pending: 1,
      confirmed: 1,
      failed: 0,
      expired: 0,
    });

    const confirmedOnly = await inject({
      method: 'GET',
      url: '/api/v1/deposits?status=confirmed',
      headers: { cookie },
    });
    expect(confirmedOnly.json().items).toHaveLength(1);
    expect(confirmedOnly.json().items[0].status).toBe('confirmed');
    // Counts stay the same regardless of which tab/filter is selected.
    expect(confirmedOnly.json().counts).toEqual(all.json().counts);
  });

  it('requires auth to list deposits', async () => {
    const res = await inject({ method: 'GET', url: '/api/v1/deposits' });
    expect(res.statusCode).toBe(401);
  });

  it('enforces the minimum deposit', async () => {
    const { cookie } = await makeUser(app);
    const res = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'card', amountMicro: 1000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth to create a deposit', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      payload: { method: 'card', amountMicro: 10_000_000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('throttles a rapid second deposit-creation call from the same user', async () => {
    // No idempotency-key protection on this endpoint (unlike order
    // creation), so a double-click would otherwise open two separate
    // checkout sessions at the real gateway — this is the guard against that.
    const { cookie } = await makeUser(app);
    const first = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'card', amountMicro: 5_000_000 },
    });
    expect(first.statusCode).toBe(201);

    const second = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'card', amountMicro: 5_000_000 },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe('RATE_LIMITED');
  });

  it('returns a clear error — no deposit created — when the gateway is not configured', async () => {
    const { cookie, userId } = await makeUser(app);
    const res = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'cryptomus', amountMicro: 5_000_000 },
    });
    expect(res.statusCode).toBe(400);
    expect(await Deposit.countDocuments({ userId })).toBe(0);
  });

  it('rejects a webhook for an unknown provider', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/some_random_provider',
      payload: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a card (stripe) webhook with an invalid signature', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/stripe',
      headers: { 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
      payload: { type: 'checkout.session.completed', data: { object: { id: 'cs_test', payment_status: 'paid' } } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a bachs webhook with an invalid signature', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/bachs',
      headers: { 'x-bachs-signature-v2': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
      payload: bachsCollectionEvent('chk_whatever'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a cryptomus webhook when Cryptomus is unconfigured', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/cryptomus',
      payload: { order_id: 'dep_1', status: 'paid', sign: 'whatever' },
    });
    expect(res.statusCode).toBe(400);
  });
});
