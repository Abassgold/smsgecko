import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeCatalog, makeUser, simulateOtp } from './factories.js';
import { Order } from '../models/Order.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { refundWaitingOrder } from '../lib/orderLifecycle.js';
import { updateSettings } from '../lib/settings.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(async () => {
  // express app needs no teardown
});

const buy = (cookie: string, body: object) =>
  inject({ method: 'POST', url: '/api/v1/orders', headers: { cookie }, payload: body });

describe('orders', () => {
  it('completes the buy → OTP lifecycle and moves money correctly', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 250_000, stock: 3 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });

    const res = await buy(cookie, { serviceId: service.id, countryId: country.id });
    expect(res.statusCode).toBe(201);
    const order = res.json();
    expect(order.status).toBe('waiting');
    expect(order.phoneNumber).toMatch(/^\+\d+$/);
    expect(order.priceMicro).toBe(250_000);
    expect(order.secondsLeft).toBeGreaterThan(0);

    // balance debited, stock decremented, one order_payment row
    expect((await User.findById(userId))!.balanceMicro).toBe(750_000);
    const debitTx = await Transaction.findOne({ userId, type: 'order_payment' });
    expect(debitTx!.amountMicro).toBe(-250_000);
    expect(debitTx!.balanceAfterMicro).toBe(750_000);
    expect(debitTx!.reference).toBe(order.id);

    // deliver the mock OTP via the polling path
    const delivered = await simulateOtp(order.id);
    expect(delivered!.status).toBe('completed');
    expect(delivered!.otpCode).toMatch(/^\d{4,8}$/);

    const view = await inject({
      method: 'GET',
      url: `/api/v1/orders/${order.id}`,
      headers: { cookie },
    });
    expect(view.json().status).toBe('completed');
    expect(view.json().otpCode).toBe(delivered!.otpCode);
    expect(view.json().messages).toHaveLength(1);
    expect(view.json().secondsLeft).toBe(0);

    // no refund for a completed order
    expect(await Transaction.countDocuments({ userId, type: 'refund' })).toBe(0);
  });

  it('refunds automatically on expiry', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 400_000, stock: 5 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });

    const order = (await buy(cookie, { serviceId: service.id, countryId: country.id })).json();
    expect((await User.findById(userId))!.balanceMicro).toBe(600_000);

    // simulate the TTL elapsing, then run what the expiry worker would do
    await Order.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await refundWaitingOrder(order.id, 'expired');
    expect(expired!.status).toBe('expired');

    expect((await User.findById(userId))!.balanceMicro).toBe(1_000_000); // fully refunded
    const refund = await Transaction.findOne({ userId, type: 'refund' });
    expect(refund!.amountMicro).toBe(400_000);
    expect(refund!.description).toBe('Order expired — refund');
    // Pairs with the original charge's own reference.
    expect(refund!.reference).toBe(`${order.id}_R`);
    const charge = await Transaction.findOne({ userId, type: 'order_payment' });
    expect(refund!.reference).toBe(`${charge!.reference}_R`);
  });

  it('a canceled order is described as such, distinctly from an expired one', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 150_000, stock: 5 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const order = (await buy(cookie, { serviceId: service.id, countryId: country.id })).json();

    const canceled = await refundWaitingOrder(order.id, 'canceled');
    expect(canceled!.status).toBe('canceled');

    const refund = await Transaction.findOne({ userId, type: 'refund' });
    expect(refund!.description).toBe('Order canceled — refund');
    expect(refund!.reference).toBe(`${order.id}_R`);
  });

  it('is idempotent for repeated create with the same key', async () => {
    const { service, country } = await makeCatalog({ stock: 5 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const body = { serviceId: service.id, countryId: country.id, idempotencyKey: 'order-key-123' };

    const a = await buy(cookie, body);
    const b = await buy(cookie, body);
    expect(a.statusCode).toBe(201);
    expect(b.json().id).toBe(a.json().id);
    expect(await Order.countDocuments({ userId })).toBe(1);
    expect(await Transaction.countDocuments({ userId, type: 'order_payment' })).toBe(1);
  });

  it('rejects a purchase with insufficient balance and touches nothing', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 900_000, stock: 4 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 100_000 });

    const res = await buy(cookie, { serviceId: service.id, countryId: country.id });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('INSUFFICIENT_BALANCE');
    expect((await User.findById(userId))!.balanceMicro).toBe(100_000);
    expect(await Order.countDocuments({ userId })).toBe(0);
  });

  it('rejects a purchase when the offer is out of stock', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 10_000, stock: 0 });
    const { cookie } = await makeUser(app, { balanceMicro: 1_000_000 });
    const res = await buy(cookie, { serviceId: service.id, countryId: country.id });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('NO_OFFER_AVAILABLE');
  });

  it('honors maxPriceMicro', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 500_000, stock: 4 });
    const { cookie } = await makeUser(app, { balanceMicro: 1_000_000 });
    const res = await buy(cookie, {
      serviceId: service.id,
      countryId: country.id,
      maxPriceMicro: 100_000,
    });
    expect(res.statusCode).toBe(422);
  });

  it('cancels a waiting order and refunds; a completed order cannot be canceled', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 300_000, stock: 2 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });

    const order = (await buy(cookie, { serviceId: service.id, countryId: country.id })).json();
    const cancel = await inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/cancel`,
      headers: { cookie },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe('canceled');
    expect((await User.findById(userId))!.balanceMicro).toBe(1_000_000);

    const again = await inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/cancel`,
      headers: { cookie },
    });
    expect(again.statusCode).toBe(409);
  });

  it('refuses to cancel before the provider hold elapses', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 200_000, stock: 3 });
    const { cookie } = await makeUser(app, { balanceMicro: 1_000_000 });

    const order = (await buy(cookie, { serviceId: service.id, countryId: country.id })).json();
    // The mock provider holds for 0s; relabel the order under one that holds for
    // 180s (a fresh order is always within that window) to exercise the lock.
    await Order.updateOne({ _id: order.id }, { $set: { provider: 'hero_sms' } });

    const res = await inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/cancel`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CANCEL_TOO_EARLY');
    expect(res.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('503s ordering during maintenance mode for a non-admin', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 100_000, stock: 3 });
    const { cookie } = await makeUser(app, { balanceMicro: 1_000_000 });

    await updateSettings({ maintenanceMode: true });
    try {
      const res = await buy(cookie, { serviceId: service.id, countryId: country.id });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await updateSettings({ maintenanceMode: false });
    }
  });

  it('lists and filters orders and computes stats', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 120_000, stock: 20 });
    const { cookie } = await makeUser(app, { balanceMicro: 5_000_000 });

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await buy(cookie, { serviceId: service.id, countryId: country.id })).json().id);
    }
    await simulateOtp(ids[0]!);
    await refundWaitingOrder(ids[1]!, 'expired');

    const all = await inject({ method: 'GET', url: '/api/v1/orders', headers: { cookie } });
    expect(all.json().total).toBe(3);

    const active = await inject({
      method: 'GET',
      url: '/api/v1/orders?status=active',
      headers: { cookie },
    });
    expect(active.json().items).toHaveLength(1);
    expect(active.json().items[0].status).toBe('waiting');

    const stats = await inject({
      method: 'GET',
      url: '/api/v1/orders/stats',
      headers: { cookie },
    });
    const s = stats.json();
    expect(s.totalOrders).toBe(3);
    expect(s.activeOrders).toBe(1);
    expect(s.completedOrders).toBe(1);
    expect(s.successRate).toBeCloseTo(0.5); // 1 completed of 2 resolved
    expect(s.series).toHaveLength(30);
  });

  it('GET /orders/active lists the waiting orders', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 100_000, stock: 5 });
    const { cookie } = await makeUser(app, { balanceMicro: 1_000_000 });
    await buy(cookie, { serviceId: service.id, countryId: country.id });

    const res = await inject({ method: 'GET', url: '/api/v1/orders/active', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].status).toBe('waiting');
  });

  it('resends a waiting order without charging', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 200_000, stock: 5 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const order = (await buy(cookie, { serviceId: service.id, countryId: country.id })).json();

    const res = await inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/resend`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('waiting');
    expect((await User.findById(userId))!.balanceMicro).toBe(800_000); // only the purchase
  });

  it('reactivates a completed order for another code and charges again', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 250_000, stock: 5 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const order = (await buy(cookie, { serviceId: service.id, countryId: country.id })).json();
    await simulateOtp(order.id);
    expect((await User.findById(userId))!.balanceMicro).toBe(750_000);

    const res = await inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/reactivate`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('waiting');
    expect(res.json().otpCode).toBeNull();
    expect((await User.findById(userId))!.balanceMicro).toBe(500_000); // charged 250k again

    const again = await simulateOtp(order.id);
    expect(again!.status).toBe('completed');
    expect(await Order.countDocuments({ userId })).toBe(1); // same order, reused
  });

  it('a refund after reactivation is paired with the reactivation charge, not the original', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 200_000, stock: 5 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const order = (await buy(cookie, { serviceId: service.id, countryId: country.id })).json();
    await simulateOtp(order.id);

    await inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/reactivate`,
      headers: { cookie },
    });
    const reactivationCharge = await Transaction.findOne({
      userId,
      type: 'order_payment',
      reference: `${order.id}_reactivate`,
    });
    expect(reactivationCharge).not.toBeNull();

    await Order.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await refundWaitingOrder(order.id, 'expired');

    const refund = await Transaction.findOne({ userId, type: 'refund' });
    expect(refund!.reference).toBe(`${order.id}_reactivate_R`);
    // Not the original creation charge's reference.
    expect(refund!.reference).not.toBe(`${order.id}_R`);
  });

  it('completes an order via the inbound SMS webhook', async () => {
    const { service, country } = await makeCatalog({ priceMicro: 100_000, stock: 5 });
    const { cookie } = await makeUser(app, { balanceMicro: 1_000_000 });
    const order = (await buy(cookie, { serviceId: service.id, countryId: country.id })).json();
    const ref = (await Order.findById(order.id))!.providerRef;

    const hook = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/sms',
      payload: { activationId: ref, code: '456123' },
    });
    expect(hook.statusCode).toBe(200);
    expect(hook.json().applied).toBe(true);

    const view = await inject({
      method: 'GET',
      url: `/api/v1/orders/${order.id}`,
      headers: { cookie },
    });
    expect(view.json().status).toBe('completed');
    expect(view.json().otpCode).toBe('456123');
    expect(view.json().messages).toHaveLength(1);
    expect(view.json().messages[0].text).toContain('456123');
  });

  it('acks an SMS webhook for an unknown activation without erroring', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/webhooks/sms',
      payload: { activationId: 'no-such-activation', code: '111111' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().matched).toBe(false);
  });
});
