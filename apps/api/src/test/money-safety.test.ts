import { beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { buildApp } from '../app.js';
import { makeCatalog, makeUser, simulateOtp } from './factories.js';
import { Order } from '../models/Order.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { encryptJson } from '../lib/secretbox.js';
import { debit } from '../lib/ledger.js';
import { logger } from '../lib/logger.js';
import { applyOtpToOrder, refundWaitingOrder } from '../lib/orderLifecycle.js';
import { bustProviderCache } from '../providers/sms/registry.js';
import { cancelOrder, createOrder, listOrders, resendOrder, retryOrder } from '../services/orders.service.js';
import { runExpiry, runProvisioningReaper } from '../workers/index.js';
import {
  parseReleaseResponse,
  parseRentResponse,
  parseStatusResponse,
} from '../providers/sms/adapters/activateProtocol.js';
import { NoStockError, ProviderUnavailableError } from '../providers/sms/types.js';

let app: Application;
beforeAll(async () => {
  app = await buildApp({ logger: false });
});

/** Re-point the mock provider's behaviour (release answer, forced failures) on top of the catalog the test made. */
async function mockKnobs(cat: { serviceCode: string; countryCode: string }, price: number, knobs: Record<string, unknown>) {
  await ProviderConfig.updateOne(
    { key: 'mock' },
    {
      $set: {
        configEnc: encryptJson({
          catalogPriceMicro: price,
          catalogStock: 10,
          catalogServices: [{ code: cat.serviceCode, name: cat.serviceCode }],
          catalogCountries: [{ code: cat.countryCode, name: cat.countryCode, iso2: 'us', dialCode: '1' }],
          ...knobs,
        }),
      },
    },
  );
  bustProviderCache();
}

async function setup(opts: { price?: number; balance?: number; knobs?: Record<string, unknown> } = {}) {
  const price = opts.price ?? 200_000;
  const cat = await makeCatalog({ priceMicro: price, stock: 10 });
  if (opts.knobs) await mockKnobs(cat, price, opts.knobs);
  const { userId } = await makeUser(app, { balanceMicro: opts.balance ?? 2_000_000 });
  const user = async () => (await User.findById(userId))!;
  const buy = async () => (await createOrder(await user(), { serviceId: cat.serviceCode, countryId: cat.countryCode }, 'api')).order;
  const balance = async () => (await user()).balanceMicro;
  return { cat, price, userId, user, buy, balance };
}

describe('hold the money first, then rent (manesms sequence)', () => {
  it('parallel purchases on a balance for ONE order rent exactly one number', async () => {
    const { buy, balance, userId } = await setup({ price: 200_000, balance: 250_000 });
    const results = await Promise.allSettled([buy(), buy(), buy()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(failed.every((r) => r.reason?.statusCode === 402)).toBe(true);
    // Nothing was rented for the losers: one real number, balance is what is left.
    expect(await Order.countDocuments({ userId, providerRef: { $ne: null } })).toBe(1);
    expect(await balance()).toBe(50_000);
  });

  it('a provider outage after the money is held refunds it, hides the order, and frees the idempotency key', async () => {
    const { cat, price, buy, balance, userId, user } = await setup({ knobs: { failRent: true } });
    const before = await balance();
    await expect(buy()).rejects.toMatchObject({ statusCode: 503, code: 'PROVIDER_UNAVAILABLE' });
    expect(await balance()).toBe(before);

    const types = (await Transaction.find({ userId }).sort({ createdAt: 1 })).map((t) => t.type);
    expect(types).toEqual(expect.arrayContaining(['order_payment', 'refund']));
    // Hidden from the customer, and never polled.
    expect((await listOrders(await user(), { page: 1, limit: 20, status: 'all' })).total).toBe(0);
    const ghost = await Order.findOne({ userId });
    expect(ghost).toMatchObject({ provisioning: true, status: 'canceled' });

    // The same idempotency key can be used again once the provider is back.
    await mockKnobs(cat, price, {});
    const keyed = { serviceId: cat.serviceCode, countryId: cat.countryCode, idempotencyKey: 'ms-key-0001' };
    await mockKnobs(cat, price, { failRent: true });
    await expect(createOrder(await user(), keyed, 'api')).rejects.toMatchObject({ statusCode: 503 });
    await mockKnobs(cat, price, {});
    const ok = await createOrder(await user(), keyed, 'api');
    expect(ok.order.status).toBe('waiting');
    expect(ok.order.provisioning).toBe(false);
    expect(ok.order.providerRef).toBeTruthy();
  });

  it('the reaper refunds a purchase stuck provisioning (process died mid-call)', async () => {
    const { buy, balance, userId } = await setup();
    const real = await buy();
    const start = await balance();
    const stuck = await Order.create({
      userId, source: 'api', serviceId: real.serviceId, countryId: real.countryId, serviceSlug: real.serviceSlug,
      serviceName: real.serviceName, countryName: real.countryName, countryCode: real.countryCode,
      countryFlagEmoji: '🏳️', phoneNumber: '', priceMicro: 150_000, status: 'waiting', provisioning: true,
      provider: 'unknown', providerRef: null, expiresAt: new Date(Date.now() + 600_000),
    });
    await debit(userId, 150_000, { type: 'order_payment', description: 'Order payment', orderId: stuck._id, reference: String(stuck._id) });
    expect(await balance()).toBe(start - 150_000);

    await runProvisioningReaper(logger); // too fresh: untouched
    expect(await balance()).toBe(start - 150_000);

    await Order.collection.updateOne({ _id: stuck._id }, { $set: { createdAt: new Date(Date.now() - 3 * 60_000) } });
    await runProvisioningReaper(logger);
    expect(await balance()).toBe(start);
    expect((await Order.findById(stuck._id))!.status).toBe('canceled');
    // The real order is untouched.
    expect((await Order.findById(real._id))!.status).toBe('waiting');
  });
});

describe('the refund is one step', () => {
  it('if the refund cannot be paid, the order stays open: nothing is closed without its money', async () => {
    const { buy, userId } = await setup();
    const order = await buy();
    await User.deleteOne({ _id: userId }); // the credit now fails
    await expect(refundWaitingOrder(order._id, 'canceled')).rejects.toThrow();
    expect((await Order.findById(order._id))!.status).toBe('waiting');
    expect(await Transaction.countDocuments({ orderId: order._id, type: 'refund' })).toBe(0);
  });

  it('two refunds at the same moment (a cancel and the expiry) pay exactly once', async () => {
    const { buy, balance, price } = await setup({ balance: 1_000_000 });
    const order = await buy();
    expect(await balance()).toBe(1_000_000 - price);
    const results = await Promise.all([refundWaitingOrder(order._id, 'canceled'), refundWaitingOrder(order._id, 'expired')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance()).toBe(1_000_000);
    expect(await Transaction.countDocuments({ orderId: order._id, type: 'refund' })).toBe(1);
  });
});

describe('cancel: the provider confirms first (manesms sequence)', () => {
  it('refunds only when the provider accepts', async () => {
    const s = await setup({ knobs: { release: 'canceled' } });
    const order = await s.buy();
    const after = await s.balance();
    const canceled = await cancelOrder(await s.user(), order.id as string);
    expect(canceled.status).toBe('canceled');
    expect(await s.balance()).toBe(after + s.price);
  });

  it('provider unreachable: 503, nothing refunded, order still waiting', async () => {
    const s = await setup({ knobs: { release: 'throw' } });
    const order = await s.buy();
    const after = await s.balance();
    await expect(cancelOrder(await s.user(), order.id as string)).rejects.toMatchObject({ statusCode: 503, code: 'PROVIDER_UNAVAILABLE' });
    expect(await s.balance()).toBe(after);
    expect((await Order.findById(order._id))!.status).toBe('waiting');
  });

  it('provider says too early: CANCEL_TOO_EARLY, nothing refunded', async () => {
    const s = await setup({ knobs: { release: 'too_early' } });
    const order = await s.buy();
    const after = await s.balance();
    await expect(cancelOrder(await s.user(), order.id as string)).rejects.toMatchObject({ code: 'CANCEL_TOO_EARLY' });
    expect(await s.balance()).toBe(after);
    expect((await Order.findById(order._id))!.status).toBe('waiting');
  });

  it('the SMS beats the cancel: the customer keeps the code, no refund', async () => {
    const s = await setup({ knobs: { release: 'received' } });
    const order = await s.buy();
    const after = await s.balance();
    await expect(cancelOrder(await s.user(), order.id as string)).rejects.toMatchObject({ statusCode: 409 });
    const fresh = (await Order.findById(order._id))!;
    expect(fresh.status).toBe('completed');
    expect(fresh.otpCode).toBe('424242');
    expect(await s.balance()).toBe(after);
  });
});

describe('expiry (manesms sequence)', () => {
  const lapse = (id: unknown, msAgo = 1000) => Order.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - msAgo) } });

  it('asks the provider, then refunds', async () => {
    const s = await setup();
    const order = await s.buy();
    const after = await s.balance();
    await lapse(order._id);
    await runExpiry(logger);
    expect((await Order.findById(order._id))!.status).toBe('expired');
    expect(await s.balance()).toBe(after + s.price);
  });

  it('provider unreachable: keeps trying for 10 minutes, then refunds anyway', async () => {
    const s = await setup({ knobs: { release: 'throw' } });
    const order = await s.buy();
    const after = await s.balance();
    await lapse(order._id, 60_000);
    await runExpiry(logger);
    expect((await Order.findById(order._id))!.status).toBe('waiting');
    expect(await s.balance()).toBe(after);

    await lapse(order._id, 11 * 60_000);
    await runExpiry(logger);
    expect((await Order.findById(order._id))!.status).toBe('expired');
    expect(await s.balance()).toBe(after + s.price);
  });

  it('a code that lands at the last second is delivered, not refunded', async () => {
    const s = await setup({ knobs: { release: 'received' } });
    const order = await s.buy();
    const after = await s.balance();
    await lapse(order._id);
    await runExpiry(logger);
    const fresh = (await Order.findById(order._id))!;
    expect(fresh.status).toBe('completed');
    expect(fresh.otpCode).toBe('424242');
    expect(await s.balance()).toBe(after);
  });
});

describe('another SMS (setStatus 3): only after a code arrived', () => {
  async function completed() {
    const s = await setup();
    const order = await s.buy();
    await simulateOtp(String(order._id));
    const done = (await Order.findById(order._id))!;
    expect(done.status).toBe('completed');
    return { s, order: done };
  }

  it('is refused on a waiting order, and on activate-style providers for a waiting order too', async () => {
    const s = await setup();
    const order = await s.buy();
    await expect(retryOrder(await s.user(), order.id as string)).rejects.toMatchObject({ statusCode: 409 });
    await Order.updateOne({ _id: order._id }, { $set: { provider: 'tiger_sms' } });
    await expect(resendOrder(await s.user(), order.id as string)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('moves the code to otpHistory and waits again; cancelling that wait never refunds', async () => {
    const { s, order } = await completed();
    const code = order.otpCode!;
    const before = await s.balance();

    const again = await retryOrder(await s.user(), order.id as string);
    expect(again.status).toBe('waiting');
    expect(again.otpCode).toBeNull();
    expect(again.otpHistory).toEqual([code]);

    const reverted = await cancelOrder(await s.user(), order.id as string);
    expect(reverted.status).toBe('completed');
    expect(reverted.otpCode).toBe(code);
    expect(await s.balance()).toBe(before); // first code was delivered and paid for
  });

  it('expiry while waiting for a second SMS puts the order back to completed, no refund', async () => {
    const { s, order } = await completed();
    const before = await s.balance();
    await retryOrder(await s.user(), order.id as string);
    await Order.updateOne({ _id: order._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await runExpiry(logger);
    expect((await Order.findById(order._id))!.status).toBe('completed');
    expect(await s.balance()).toBe(before);
  });

  it('a code the order already delivered never completes it again', async () => {
    const { s, order } = await completed();
    const code = order.otpCode!;
    await retryOrder(await s.user(), order.id as string);
    const waiting = (await Order.findById(order._id))!;
    expect(await applyOtpToOrder(waiting, code, [])).toBeNull(); // the provider repeating the old code
    expect((await Order.findById(order._id))!.status).toBe('waiting');
    expect(await applyOtpToOrder(waiting, '999111', [])).not.toBeNull(); // a genuinely new one
  });

  it('is refused once the number has expired', async () => {
    const { s, order } = await completed();
    await Order.updateOne({ _id: order._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(retryOrder(await s.user(), order.id as string)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('typed provider replies (never guess)', () => {
  it('rent: stock answers are NoStock, everything else is "unavailable", never "no numbers"', () => {
    expect(() => parseRentResponse('NO_NUMBERS')).toThrow(NoStockError);
    expect(() => parseRentResponse('WRONG_MAX_PRICE:0.3')).toThrow(NoStockError);
    expect(() => parseRentResponse('NO_BALANCE')).toThrow(ProviderUnavailableError); // OUR provider account is empty
    expect(() => parseRentResponse('SOMETHING_NEW')).toThrow(ProviderUnavailableError);
    expect(parseRentResponse('ACCESS_NUMBER:77:15551234567').providerRef).toBe('77');
  });

  it('cancel: only a recognised answer is acted on', () => {
    expect(parseReleaseResponse('ACCESS_CANCEL')).toEqual({ status: 'canceled' });
    expect(parseReleaseResponse('EARLY_CANCEL_DENIED')).toEqual({ status: 'too_early' });
    expect(parseReleaseResponse('STATUS_OK:123456')).toEqual({ status: 'received', code: '123456' });
    expect(parseReleaseResponse('NO_ACTIVATION')).toEqual({ status: 'canceled' });
    // hero-sms answers a refused cancel with JSON (seen live): still "too early", not an unknown reply.
    expect(
      parseReleaseResponse('{"title":"EARLY_CANCEL_DENIED","details":"Activation can be cancelled after 2 minutes"}'),
    ).toEqual({ status: 'too_early' });
    expect(() => parseReleaseResponse('{"title":"SOMETHING_ELSE"}')).toThrow(ProviderUnavailableError);
    expect(() => parseReleaseResponse('BAD_STATUS')).toThrow(ProviderUnavailableError);
    expect(() => parseReleaseResponse('')).toThrow(ProviderUnavailableError);
  });

  it('poll: NO_ACTIVATION is never a cancel; WAIT_RETRY carries a received code', () => {
    expect(parseStatusResponse('NO_ACTIVATION')).toEqual({ status: 'waiting' });
    expect(parseStatusResponse('STATUS_WAIT_CODE')).toEqual({ status: 'waiting' });
    expect(parseStatusResponse('STATUS_CANCEL')).toEqual({ status: 'canceled' });
    expect(parseStatusResponse('STATUS_WAIT_RETRY:5555')).toMatchObject({ status: 'received', code: '5555' });
    expect(parseStatusResponse('STATUS_OK:1234')).toMatchObject({ status: 'received', code: '1234' });
  });
});
