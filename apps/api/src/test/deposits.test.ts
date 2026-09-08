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
});
