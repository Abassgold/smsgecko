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
import { parseOfferId } from '../lib/catalog.js';
import { sha256 } from '../lib/crypto.js';
import { debit } from '../lib/ledger.js';
import { applyOtpToOrder, refundWaitingOrder } from '../lib/orderLifecycle.js';
import { dispatchWebhook } from '../lib/webhooks.js';
import { holdRemainingSeconds, minHoldSecondsFor } from '../lib/providerPolicy.js';
import {
  badRequest,
  cancelTooEarly,
  conflict,
  idempotencyKeyReused,
  notFound,
  noOfferAvailable,
  paymentRequired,
  requestInProgress,
  serviceUnavailable,
  unprocessable,
} from '../lib/errors.js';

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

    // Rent from the first provider in the fallback chain that has stock. The cap
    // is the active provider's *raw* price, so we're never billed above what we quoted.
    const rent = await rentWithFallback({
      serviceSlug: serviceCode,
      countryCode,
      dialCode: '',
      maxPriceMicro: cat.rawPriceMicro,
    });

    const data = {
      userId: user._id,
      source,
      serviceId: serviceCode,
      countryId: countryCode,
      serviceSlug: cat.serviceSlug,
      serviceName: cat.serviceName,
      serviceIconKey: cat.serviceIconKey,
      countryName: cat.countryName,
      countryCode: cat.countryCode,
      countryFlagEmoji: cat.countryFlagEmoji,
      phoneNumber: rent.result.phoneNumber,
      priceMicro: price,
      status: 'waiting' as const,
      provider: rent.providerKey,
      providerConfigId: rent.providerConfigId,
      providerLabel: rent.providerLabel,
      providerRef: rent.result.providerRef,
      providerCostMicro: rent.result.costMicro ?? cat.rawPriceMicro,
      ...(body.idempotencyKey
        ? { idempotencyKey: body.idempotencyKey, idempotencyBodyHash: bodyHash }
        : {}),
      deliverAt: rent.result.deliverAt ?? null,
      // Never auto-expire before the provider's minimum hold — some upstreams
      // still bill us for the number until then (mirrors FloZap's per-provider grace).
      expiresAt: new Date(
        Date.now() + Math.max(settings.orderTtlSeconds, minHoldSecondsFor(rent.providerKey)) * 1000,
      ),
    };

    if (supportsTransactions()) {
      const session = await mongoose.startSession();
      try {
        let created: OrderDoc | undefined;
        await session.withTransaction(async () => {
          // Create the order first so the payment transaction can carry its id.
          const [doc] = await Order.create([data], { session });
          if (!doc) throw new Error('order creation returned no document');
          await debit(user._id, price, {
            type: 'order_payment',
            description: 'Order payment',
            session,
            orderId: doc._id,
          });
          created = doc;
        });
        if (!created) throw new Error('order creation returned no document');
        void dispatchWebhook(user, 'order.created', created);
        return { order: created, reused: false };
      } catch (err) {
        // Order never persisted — hand the rented number back to the provider.
        await releaseNumber(rent.providerConfigId, rent.result.providerRef);
        if (isDuplicateKey(err) && body.idempotencyKey) {
          const existing = await Order.findOne({
            userId: user._id,
            idempotencyKey: body.idempotencyKey,
          });
          if (existing) return { order: existing, reused: true };
        }
        throw err;
      } finally {
        await session.endSession();
      }
    }

    // Fallback (no replica set): sequential with compensation.
    let doc: OrderDoc;
    try {
      doc = await Order.create(data);
    } catch (err) {
      await releaseNumber(rent.providerConfigId, rent.result.providerRef);
      if (isDuplicateKey(err) && body.idempotencyKey) {
        const existing = await Order.findOne({
          userId: user._id,
          idempotencyKey: body.idempotencyKey,
        });
        if (existing) return { order: existing, reused: true };
      }
      throw err;
    }

    try {
      await debit(user._id, price, {
        type: 'order_payment',
        description: 'Order payment',
        orderId: doc._id,
      });
    } catch (err) {
      // Payment failed after the order was written — undo it.
      await doc.deleteOne();
      await releaseNumber(rent.providerConfigId, rent.result.providerRef);
      throw err;
    }

    void dispatchWebhook(user, 'order.created', doc);
    return { order: doc, reused: false };
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
  const filter: Record<string, unknown> = { userId: user._id };
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
  const order = await Order.findOne({ _id: orderId, userId: user._id });
  if (!order) throw notFound('Order not found');
  const messages = await SmsMessage.find({ orderId: order._id }).sort({ receivedAt: 1 });
  return { order, messages };
}

export async function finishOrder(user: UserDoc, orderId: string): Promise<OrderDoc> {
  const order = await Order.findOne({ _id: orderId, userId: user._id });
  if (!order) throw notFound('Order not found');
  if (order.status === 'completed' && !order.finishedAt) {
    order.finishedAt = new Date();
    await order.save();
    // Tell the *provider that fulfilled this order* we're done with the number
    // (resolved from order.providerConfigId, not the currently-active provider).
    try {
      const provider = await getProviderForOrder(order);
      await provider.finish?.(order.providerRef);
    } catch {
      /* best-effort — the order is already marked finished locally */
    }
  }
  return order;
}

export async function cancelOrder(user: UserDoc, orderId: string): Promise<OrderDoc> {
  const order = await Order.findOne({ _id: orderId, userId: user._id });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'waiting') {
    throw conflict(`Order is already ${order.status}`);
  }
  if (order.otpCode) throw conflict('Order already received a code');

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

  const canceled = await refundWaitingOrder(order._id, 'canceled');
  if (!canceled) {
    // Lost a race with the worker/delivery — re-read and report current state.
    const fresh = await Order.findById(order._id);
    throw conflict(`Order is already ${fresh?.status ?? 'resolved'}`);
  }
  return canceled;
}

/** Every still-`waiting` order for the user, newest first. */
export async function listActiveOrders(user: UserDoc): Promise<OrderDoc[]> {
  return Order.find({ userId: user._id, status: 'waiting' }).sort({ createdAt: -1 });
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

  const messages = text
    ? [{ sender: order.providerLabel ?? 'SMS', text, receivedAt: new Date() }]
    : [];
  const updated = await applyOtpToOrder(order, code, messages);
  if (!updated) {
    const fresh = await Order.findById(order._id);
    return { matched: true, applied: false, status: fresh?.status ?? 'resolved' };
  }
  return { matched: true, applied: true, orderId: updated.id as string, otpCode: updated.otpCode ?? null };
}

/**
 * Ask the upstream for another SMS on a still-`waiting` order. Free — no new
 * rental, no charge. The polling worker picks up whatever arrives next.
 */
export async function resendOrder(user: UserDoc, orderId: string): Promise<OrderDoc> {
  const order = await Order.findOne({ _id: orderId, userId: user._id });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'waiting') throw conflict(`Order is already ${order.status}`);

  const provider = await getProviderForOrder(order);
  if (!provider.resend) throw conflict('This number does not support requesting another code');
  try {
    await provider.resend(order.providerRef);
  } catch {
    /* best-effort */
  }
  // Force the next worker tick to poll this order immediately.
  await Order.updateOne({ _id: order._id, status: 'waiting' }, { $set: { lastPolledAt: null } });
  return (await Order.findById(order._id)) ?? order;
}

/**
 * Buy another code on an already-`completed` order, on the same number. Charges
 * the current tier price, reopens the same order as `waiting`, keeps its message
 * history. Only providers that implement `reactivate` support this.
 */
export async function reactivateOrder(user: UserDoc, orderId: string): Promise<OrderDoc> {
  const order = await Order.findOne({ _id: orderId, userId: user._id });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'completed') {
    throw conflict('Only a completed order can be reactivated');
  }

  const provider = await getProviderForOrder(order);
  if (!provider.reactivate) throw conflict('This number cannot be reactivated');

  const settings = await getSettings();
  const cat = await resolveForOrder(order.serviceId, order.countryId, settings);
  if (!cat) throw noOfferAvailable();
  if (cat.priceMicro > user.balanceMicro) throw paymentRequired();

  const result = await provider.reactivate(order.providerRef).catch(() => null);
  if (!result) throw conflict('The provider could not reactivate this number');

  await debit(user._id, cat.priceMicro, {
    type: 'order_payment',
    description: 'Number reactivation',
    orderId: order._id,
  });

  const expiresAt = new Date(
    Date.now() + Math.max(settings.orderTtlSeconds, minHoldSecondsFor(order.provider)) * 1000,
  );
  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        status: 'waiting',
        otpCode: null,
        completedAt: null,
        finishedAt: null,
        deliverAt: null,
        lastPolledAt: null,
        providerRef: result.providerRef,
        providerCostMicro: (order.providerCostMicro ?? 0) + cat.rawPriceMicro,
        expiresAt,
      },
    },
  );
  return (await Order.findById(order._id))!;
}
