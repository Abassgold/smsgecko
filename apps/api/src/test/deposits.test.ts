import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeUser } from './factories.js';
import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { Deposit } from '../models/Deposit.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(async () => {
  // express app needs no teardown
});

describe('deposits', () => {
  it('creates a pending deposit, confirms once, and credits the wallet', async () => {
    const { cookie, userId } = await makeUser(app);
    expect((await User.findById(userId))!.balanceMicro).toBe(0);

    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'mock', amountMicro: 10_000_000 },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().status).toBe('pending');
    const depositId = create.json().id as string;

    const confirm = await inject({
      method: 'POST',
      url: `/api/v1/deposits/${depositId}/mock-confirm`,
      headers: { cookie },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().status).toBe('confirmed');

    expect((await User.findById(userId))!.balanceMicro).toBe(10_000_000);
    const tx = await Transaction.findOne({ userId, type: 'deposit' });
    expect(tx!.amountMicro).toBe(10_000_000);
    expect(tx!.balanceAfterMicro).toBe(10_000_000);

    // second confirm is a no-op conflict, balance unchanged
    const again = await inject({
      method: 'POST',
      url: `/api/v1/deposits/${depositId}/mock-confirm`,
      headers: { cookie },
    });
    expect(again.statusCode).toBe(409);
    expect((await User.findById(userId))!.balanceMicro).toBe(10_000_000);
  });

  it('lists a user\'s own deposits, newest first, paginated', async () => {
    const { cookie } = await makeUser(app);
    const other = await makeUser(app);

    for (const amountMicro of [1_000_000, 2_000_000, 3_000_000]) {
      await inject({
        method: 'POST',
        url: '/api/v1/deposits',
        headers: { cookie },
        payload: { method: 'mock', amountMicro },
      });
    }
    // Another user's deposit must not leak into this list.
    await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie: other.cookie },
      payload: { method: 'mock', amountMicro: 9_000_000 },
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
      payload: { method: 'mock', amountMicro: 1_000_000 },
    });
    await inject({
      method: 'POST',
      url: `/api/v1/deposits/${confirmed.json().id}/mock-confirm`,
      headers: { cookie },
    });
    await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'mock', amountMicro: 2_000_000 },
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
      payload: { method: 'mock', amountMicro: 1000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('confirms via the payment webhook', async () => {
    const { cookie, userId } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'crypto_usdt', amountMicro: 5_000_000 },
    });
    const deposit = await Deposit.findById(create.json().id);
    expect(deposit!.payAddress).toBeTruthy();

    const hook = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/mock',
      payload: { providerRef: deposit!.providerRef, status: 'confirmed' },
    });
    expect(hook.statusCode).toBe(200);
    expect((await User.findById(userId))!.balanceMicro).toBe(5_000_000);
  });

  it('requires auth to create a deposit', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      payload: { method: 'mock', amountMicro: 10_000_000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('falls back to the mock provider for card deposits when Stripe is unconfigured', async () => {
    const { cookie } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'card', amountMicro: 5_000_000 },
    });
    expect(create.statusCode).toBe(201);
    const deposit = await Deposit.findById(create.json().id);
    expect(deposit!.provider).toBe('mock');
    expect(deposit!.payUrl).toBeTruthy();
  });

  it('mock-fallback deposits always point to our own checkout page, keyed by the real deposit id', async () => {
    const { cookie } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'card', amountMicro: 5_000_000 },
    });
    const id = create.json().id as string;
    // The response itself already carries the rewritten URL...
    expect(create.json().payUrl).toBe(`/deposit/checkout/${id}`);
    // ...and it's what's actually persisted, not the provider's placeholder ref.
    const deposit = await Deposit.findById(id);
    expect(deposit!.payUrl).toBe(`/deposit/checkout/${id}`);
  });

  it('mock-fallback crypto deposits get both a pay address AND a checkout page', async () => {
    const { cookie } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'crypto_usdt', amountMicro: 5_000_000 },
    });
    const id = create.json().id as string;
    expect(create.json().payAddress).toBeTruthy();
    expect(create.json().payUrl).toBe(`/deposit/checkout/${id}`);
  });

  it('falls back to the mock provider for korapay deposits when Korapay is unconfigured', async () => {
    const { cookie } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'korapay', amountMicro: 5_000_000, korapayCurrency: 'GHS' },
    });
    expect(create.statusCode).toBe(201);
    const deposit = await Deposit.findById(create.json().id);
    expect(deposit!.provider).toBe('mock');
  });

  it('requires a korapayCurrency for the korapay method', async () => {
    const { cookie } = await makeUser(app);
    const res = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'korapay', amountMicro: 5_000_000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unsupported korapayCurrency', async () => {
    const { cookie } = await makeUser(app);
    const res = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'korapay', amountMicro: 5_000_000, korapayCurrency: 'EUR' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('falls back to the mock provider for cryptomus deposits when Cryptomus is unconfigured', async () => {
    const { cookie } = await makeUser(app);
    const create = await inject({
      method: 'POST',
      url: '/api/v1/deposits',
      headers: { cookie },
      payload: { method: 'cryptomus', amountMicro: 5_000_000 },
    });
    expect(create.statusCode).toBe(201);
    const deposit = await Deposit.findById(create.json().id);
    expect(deposit!.provider).toBe('mock');
  });

  it('rejects a webhook for an unknown provider', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/some_random_provider',
      payload: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a stripe webhook when Stripe is unconfigured', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/stripe',
      payload: { type: 'checkout.session.completed', data: { object: { id: 'cs_test', payment_status: 'paid' } } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a nowpayments webhook when NowPayments is unconfigured', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/nowpayments',
      payload: { invoice_id: 'inv_1', payment_status: 'finished' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a korapay webhook when Korapay is unconfigured', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/korapay',
      payload: { event: 'charge.success', data: { reference: 'dep_1', status: 'success' } },
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
