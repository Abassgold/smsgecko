import type { CreateOrderBody, OrderSource } from '@smsgecko/shared';
import { mongoose, supportsTransactions } from '../db/mongoose.js';
import { Order, type OrderDoc } from '../models/Order.js';
import { SmsMessage } from '../models/SmsMessage.js';
import { IdempotencyLock } from '../models/IdempotencyLock.js';
import type { UserDoc } from '../models/User.js';
import {
  getCatalogProvider,
  getProviderForOrder,
  rentWithFallback,
  releaseNumber,
} from '../providers/sms/registry.js';
import { resolveForOrder } from './catalog.service.js';
import { getSettings } from '../lib/settings.js';
import { logger } from '../lib/logger.js';
import { parseOfferId } from '../lib/catalog.js';
import { randomInt } from 'node:crypto';
import { sha256, friendlyCode } from '../lib/crypto.js';
import { debit } from '../lib/ledger.js';
import {
  applyOtpToOrder,
  cancelWithProvider,
  refundWaitingOrder,
  revertToCompleted,
} from '../lib/orderLifecycle.js';
// import { dispatchWebhook } from '../lib/webhooks.js';
import { holdRemainingSeconds, minHoldSecondsFor } from '../lib/providerPolicy.js';
import {
  AppError,
  badRequest,
  cancelTooEarly,
  conflict,
  idempotencyKeyReused,
  notFound,
  noOfferAvailable,
  paymentRequired,
  providerError,
  requestInProgress,
  serviceUnavailable,
  unprocessable,
} from '../lib/errors.js';

/** Orders still being created (money held, number not rented yet) are invisible to customers. */
const VISIBLE = { provisioning: { $ne: true } } as const;

function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: number; cause?: { code?: number } };
  return e?.code === 11000 || e?.cause?.code === 11000;
}

/** Hash of the params that define *what* is being bought — the same key
 * replayed with a different one of these is a different logical request.
 * `maxPriceMicro` is deliberately excluded: it's a safety cap applied at
 * execution time, not part of the purchase's identity, so retrying the same
 * logical order with a relaxed (or tightened) cap is still the same request. */
function hashOrderBody(body: CreateOrderBody): string {
  return sha256(
    JSON.stringify({
      offerId: body.offerId ?? null,
      serviceId: body.serviceId ?? null,
      countryId: body.countryId ?? null,
      operator: body.operator ?? null,
    }),
  );
}

const HEX24 = /^[a-f0-9]{24}$/i;
/** An API-supplied order id may be the short publicId ("SG-8FQ3-K2") or the
 *  raw 24-hex _id — resolve it to the right lookup filter. */
function orderIdFilter(orderId: string): Record<string, unknown> {
  if (HEX24.test(orderId)) return { _id: orderId };
  // The SMS-Activate-style API's numeric id.
  if (/^\d{10}$/.test(orderId)) return { activationId: orderId };
  return { publicId: orderId };
}

/** A fresh, unique 10-digit numeric activation id. */
async function newActivationId(): Promise<string> {
  for (;;) {
    const id = String(randomInt(1_000_000_000, 10_000_000_000));
    if (!(await Order.exists({ activationId: id }))) return id;
  }
}

/** A fresh, unique, human-friendly order reference like "SG-8FQ3-K2". */
async function newOrderPublicId(): Promise<string> {
  for (let i = 0; i < 6; i += 1) {
    const c = friendlyCode(6);
    const id = `SG-${c.slice(0, 4)}-${c.slice(4)}`;
    if (!(await Order.exists({ publicId: id }))) return id;
  }
  const c = friendlyCode(9); // vanishingly unlikely fallback: more entropy
  return `SG-${c.slice(0, 4)}-${c.slice(4, 7)}-${c.slice(7)}`;
}

/**
 * A purchase whose number could not be rented: give the held money back and free the idempotency key so the customer
 * can simply try again. The order stays hidden (still `provisioning`), as in manesms.
 */
async function failProvisioning(order: OrderDoc): Promise<void> {
  await refundWaitingOrder(order._id, 'canceled');
  await Order.updateOne({ _id: order._id }, { $unset: { idempotencyKey: 1, idempotencyBodyHash: 1 } });
}

export interface CreateOrderResult {
  order: OrderDoc;
  reused: boolean;
}

export async function createOrder(
  user: UserDoc,
  body: CreateOrderBody,
  source: OrderSource = 'web',
): Promise<CreateOrderResult> {
  const bodyHash = body.idempotencyKey ? hashOrderBody(body) : null;

  if (body.idempotencyKey) {
    const existing = await Order.findOne({ userId: user._id, idempotencyKey: body.idempotencyKey });
    if (existing) {
      if (existing.idempotencyBodyHash && existing.idempotencyBodyHash !== bodyHash) {
        throw idempotencyKeyReused();
      }
      if (existing.provisioning) throw requestInProgress(); // still being created
      return { order: existing, reused: true };
    }

    // Claim the key for the duration of this request so a second concurrent
    // call with it gets rejected instead of racing this one to create a
    // duplicate order. Released in the `finally` below no matter how this
    // resolves; the model's TTL index is the safety net if we don't get there.
    try {
      await IdempotencyLock.create({ userId: user._id, key: body.idempotencyKey });
    } catch (err) {
      if (isDuplicateKey(err)) throw requestInProgress();
      throw err;
    }
  }

  try {
    const settings = await getSettings();
    if (settings.maintenanceMode && user.role !== 'admin') {
      throw serviceUnavailable('Ordering is paused for maintenance');
    }

    // Which service/country/tier to buy. An offerId ("<svc>::<ctry>[::<i>]") names
    // an exact price tier and wins; otherwise serviceId + countryId → cheapest tier.
    let serviceCode = body.serviceId;
    let countryCode = body.countryId;
    let tierIndex: number | undefined;
    if (body.offerId) {
      const parsed = parseOfferId(body.offerId);
      if (!parsed) throw badRequest('offerId must be "<serviceId>::<countryId>[::<tierIndex>]"');
      serviceCode = parsed.serviceCode;
      countryCode = parsed.countryCode;
      tierIndex = parsed.tierIndex;
    }
    if (!serviceCode || !countryCode) {
      throw badRequest('Provide offerId, or both serviceId and countryId');
    }

    // Price the service×country against the active (top-enabled) provider.
    if (!(await getCatalogProvider())) throw conflict('No SMS provider is enabled');
    const cat = await resolveForOrder(serviceCode, countryCode, settings, tierIndex, body.operator);
    if (!cat) throw noOfferAvailable();

    const price = cat.priceMicro;
    if (body.maxPriceMicro != null && price > body.maxPriceMicro) {
      throw unprocessable('Current price is above your max price');
    }
    if (price > user.balanceMicro) throw paymentRequired();

    /*
     * Phase 1: HOLD THE CUSTOMER'S MONEY FIRST (same sequence as manesms). The order is created as `provisioning`
     * (hidden, never polled) together with the debit, in one transaction. The provider call cannot be rolled back
     * by Mongo, so we never spend our own money before the customer's is safely taken: parallel purchases with a
     * low balance fail here, at the guarded debit, before any number is rented.
     */
    const publicId = await newOrderPublicId();
    const activationId = await newActivationId();
    const ttlMs = Math.max(settings.orderTtlSeconds, 0) * 1000;
    const data = {
      userId: user._id,
      source,
      publicId,
      activationId,
      serviceId: serviceCode,
      countryId: countryCode,
      serviceSlug: cat.serviceSlug,
      serviceName: cat.serviceName,
      serviceIconKey: cat.serviceIconKey,
      countryName: cat.countryName,
      countryCode: cat.countryCode,
      countryFlagEmoji: cat.countryFlagEmoji,
      phoneNumber: '',
      priceMicro: price,
      status: 'waiting' as const,
      provisioning: true,
      provider: 'unknown',
      providerRef: null,
      ...(body.idempotencyKey
        ? { idempotencyKey: body.idempotencyKey, idempotencyBodyHash: bodyHash }
        : {}),
      deliverAt: null,
      expiresAt: new Date(Date.now() + ttlMs),
    };

    let held: OrderDoc;
    try {
      if (supportsTransactions()) {
        const session = await mongoose.startSession();
        try {
          let created: OrderDoc | undefined;
          await session.withTransaction(async () => {
            // Create the order first so the payment transaction can carry its id.
            const [doc] = await Order.create([data], { session });
            if (!doc) throw new Error('order creation returned no document');
            // Throws 402 when the balance is too low, aborting the whole transaction.
            await debit(user._id, price, {
              type: 'order_payment',
              description: 'Order payment',
              session,
              orderId: doc._id,
              reference: String(doc._id),
            });
            created = doc;
          });
          if (!created) throw new Error('order creation returned no document');
          held = created;
        } finally {
          await session.endSession();
        }
      } else {
        // No replica set (dev): sequential, undone by hand if the debit fails.
        const doc = await Order.create(data);
        try {
          await debit(user._id, price, {
            type: 'order_payment',
            description: 'Order payment',
            orderId: doc._id,
            reference: String(doc._id),
          });
        } catch (err) {
          await doc.deleteOne();
          throw err;
        }
        held = doc;
      }
    } catch (err) {
      if (isDuplicateKey(err) && body.idempotencyKey) {
        const existing = await Order.findOne({ userId: user._id, idempotencyKey: body.idempotencyKey });
        if (existing) {
          if (existing.provisioning && existing.status === 'waiting') throw requestInProgress();
          return { order: existing, reused: true };
        }
      }
      throw err;
    }

    /*
     * Phase 2: actually rent the number, from the first provider in the fallback chain that has stock. The cap is the
     * active provider's *raw* price, so we're never billed above what we quoted. If it fails, the money held in
     * phase 1 goes straight back (the reaper does the same if this process dies mid-call).
     */
    let rent: Awaited<ReturnType<typeof rentWithFallback>>;
    try {
      rent = await rentWithFallback({
        serviceSlug: serviceCode,
        countryCode,
        dialCode: '',
        maxPriceMicro: cat.rawPriceMicro,
      });
    } catch (err) {
      await failProvisioning(held);
      if (err instanceof AppError) throw err; // 422 no numbers / 503 provider unavailable (typed by the router)
      logger.error({ err, orderId: String(held._id) }, '[orders] provider rent failed');
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Numbers are temporarily unavailable. Please try again shortly.');
    }

    // The timer restarts now, so the customer gets the full window — never less than the provider's minimum hold
    // (some upstreams still bill us for the number until then).
    const expiresAt = new Date(
      Date.now() + Math.max(settings.orderTtlSeconds, minHoldSecondsFor(rent.providerKey)) * 1000,
    );
    // Only if the reaper has not already refunded this order while the provider was slow.
    const live = await Order.findOneAndUpdate(
      { _id: held._id, provisioning: true, status: 'waiting' },
      {
        $set: {
          phoneNumber: rent.result.phoneNumber,
          provider: rent.providerKey,
          providerConfigId: rent.providerConfigId,
          providerLabel: rent.providerLabel,
          providerRef: rent.result.providerRef,
          providerCostMicro: rent.result.costMicro ?? cat.rawPriceMicro,
          deliverAt: rent.result.deliverAt ?? null,
          provisioning: false,
          expiresAt,
        },
      },
      { returnDocument: 'after' },
    );
    if (!live) {
      // Refunded in the meantime: the number we just rented has no order. Hand it back.
      await releaseNumber(rent.providerConfigId, rent.result.providerRef);
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Numbers are temporarily unavailable. Please try again shortly.');
    }
    return { order: live, reused: false };
  } finally {
    if (body.idempotencyKey) {
      await IdempotencyLock.deleteOne({ userId: user._id, key: body.idempotencyKey });
    }
  }
}

export interface ListOrdersParams {
  status: string;
  page: number;
  limit: number;
}

export async function listOrders(user: UserDoc, params: ListOrdersParams) {
  const filter: Record<string, unknown> = { userId: user._id, ...VISIBLE };
  if (params.status === 'active') filter.status = 'waiting';
  else if (params.status !== 'all') filter.status = params.status;

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit),
    Order.countDocuments(filter),
  ]);

  return { items, total, totalPages: Math.max(1, Math.ceil(total / params.limit)) };
}

export async function getOrderWithMessages(user: UserDoc, orderId: string) {
  const order = await Order.findOne({ ...orderIdFilter(orderId), userId: user._id, ...VISIBLE });
  if (!order) throw notFound('Order not found');
  const messages = await SmsMessage.find({ orderId: order._id }).sort({ receivedAt: 1 });
  return { order, messages };
}

export async function finishOrder(user: UserDoc, orderId: string): Promise<OrderDoc> {
  const order = await Order.findOne({ ...orderIdFilter(orderId), userId: user._id, ...VISIBLE });
  if (!order) throw notFound('Order not found');
  if (order.status === 'completed' && !order.finishedAt) {
    order.finishedAt = new Date();
    await order.save();
    // Tell the *provider that fulfilled this order* we're done with the number
    // (resolved from order.providerConfigId, not the currently-active provider).
    try {
      const provider = await getProviderForOrder(order);
      await provider.finish?.(order.providerRef!);
    } catch {
      /* best-effort — the order is already marked finished locally */
    }
  }
  return order;
}

export async function cancelOrder(user: UserDoc, orderId: string): Promise<OrderDoc> {
  const order = await Order.findOne({ ...orderIdFilter(orderId), userId: user._id, ...VISIBLE });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'waiting') {
    throw conflict(`Order is already ${order.status}`);
  }
  if (order.otpCode) throw conflict('Order already received a code');

  // Waiting for a *second* SMS: the first one was delivered and paid for, so there is nothing to refund.
  if (order.otpHistory.length > 0) {
    await revertToCompleted(order._id);
    return (await Order.findById(order._id)) ?? order;
  }

  // A number is locked in for a few minutes after purchase; block the cancel
  // until that lock-in has elapsed. Never name the upstream provider.
  const holdLeft = holdRemainingSeconds(order);
  if (holdLeft > 0) {
    const mins = Math.max(1, Math.ceil(holdLeft / 60));
    throw cancelTooEarly(
      `This number is locked in for a few minutes after purchase. You can cancel it for a full refund in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      { retryAfterSeconds: holdLeft },
    );
  }

  // Ask the provider first: the customer is refunded only if it accepts the cancel.
  let outcome: Awaited<ReturnType<typeof cancelWithProvider>>;
  try {
    outcome = await cancelWithProvider(order, 'canceled');
  } catch (err) {
    logger.error({ err, orderId: String(order._id) }, '[orders] provider cancel failed');
    throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Could not cancel right now. Please try again shortly.');
  }
  if (outcome.kind === 'too_early') {
    throw cancelTooEarly('This number can be cancelled a couple of minutes after purchase. Please try again shortly.', {
      retryAfterSeconds: 30,
    });
  }
  // The SMS beat the cancel: the number stays active and the customer keeps the code.
  if (outcome.kind === 'received') throw conflict('Order already received a code');
  if (!outcome.order) {
    // Lost a race with the worker/delivery — re-read and report current state.
    const fresh = await Order.findById(order._id);
    throw conflict(`Order is already ${fresh?.status ?? 'resolved'}`);
  }
  return outcome.order;
}

/** Every still-`waiting` order for the user, newest first. */
export async function listActiveOrders(user: UserDoc): Promise<OrderDoc[]> {
  return Order.find({ userId: user._id, status: 'waiting', ...VISIBLE }).sort({ createdAt: -1 });
}

export type InboundOtpResult =
  | { matched: false }
  | { matched: true; applied: false; status: string }
  | { matched: true; applied: true; orderId: string; otpCode: string | null };

/**
 * Apply a code that arrived via the inbound SMS webhook, keyed by the provider's
 * activation id (our `Order.providerRef`). Idempotent: a code for an order that
 * already resolved is acknowledged without change. The polling worker remains
 * the fallback for any webhook we never receive.
 */
export async function deliverOtpByProviderRef(
  providerRef: string,
  code: string | null,
  text?: string | null,
): Promise<InboundOtpResult> {
  // providerRef isn't globally unique across providers — take the newest match.
  const order = await Order.findOne({ providerRef }).sort({ createdAt: -1 });
  if (!order) return { matched: false };
  if (order.status !== 'waiting') {
    return { matched: true, applied: false, status: order.status };
  }

  // `providerLabel` names our upstream reseller connection — never shown to
  // customers. Fall back to the service name instead of leaking it.
  const messages = text ? [{ sender: order.serviceName, text, receivedAt: new Date() }] : [];
  const updated = await applyOtpToOrder(order, code, messages);
  if (!updated) {
    const fresh = await Order.findById(order._id);
    return { matched: true, applied: false, status: fresh?.status ?? 'resolved' };
  }
  return { matched: true, applied: true, orderId: updated.id as string, otpCode: updated.otpCode ?? null };
}

/**
 * "Request another SMS" (setStatus 3), the manesms way: only for a COMPLETED order that has not expired. Free, no new
 * rental. This is the ONE "another SMS" path: the SMS-Activate protocol (setStatus 3) and the REST API (POST /orders/:id/resend)
 * both call it, so the two APIs behave the same. (There used to be a second path for "resend while still waiting" and a paid
 * "reactivate": both were written for providers we no longer sell through, and neither works with Tiger, Hero or SMSBower.) The delivered code moves into `otpHistory` so the poller can tell the new SMS from the old one, and the
 * order goes back to `waiting`. Cancelling or expiring in that state never refunds (see revertToCompleted).
 */
export async function retryOrder(user: UserDoc, orderId: string): Promise<OrderDoc> {
  const order = await Order.findOne({ ...orderIdFilter(orderId), userId: user._id, ...VISIBLE });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'completed' || !order.otpCode) {
    throw conflict('Another SMS can only be requested after a code has arrived');
  }
  if (order.expiresAt.getTime() <= Date.now()) throw conflict('This number has expired');

  const provider = await getProviderForOrder(order);
  if (!provider.resend) throw conflict('This number does not support requesting another code');
  try {
    await provider.resend(order.providerRef!);
  } catch (err) {
    logger.error({ err, orderId: String(order._id) }, '[orders] provider retry failed');
    throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Could not request another SMS right now. Please try again shortly.');
  }
  await Order.updateOne(
    { _id: order._id, status: 'completed' },
    {
      $set: { status: 'waiting', otpCode: null, completedAt: null, lastPolledAt: null },
      $push: { otpHistory: order.otpCode },
    },
  );
  return (await Order.findById(order._id)) ?? order;
}
