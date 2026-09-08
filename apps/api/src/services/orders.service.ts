import type { CreateOrderBody } from '@smsgecko/shared';
import { mongoose, supportsTransactions } from '../db/mongoose.js';
import { Order, type OrderDoc } from '../models/Order.js';
import { SmsMessage } from '../models/SmsMessage.js';
import type { UserDoc } from '../models/User.js';
import { getCatalogProvider, rentWithFallback, releaseNumber } from '../providers/sms/registry.js';
import { resolveForOrder } from './catalog.service.js';
import { getSettings } from '../lib/settings.js';
import { debit } from '../lib/ledger.js';
import { refundWaitingOrder } from '../lib/orderLifecycle.js';
import { holdRemainingSeconds, minHoldSecondsFor } from '../lib/providerPolicy.js';
import { conflict, forbidden, notFound, paymentRequired, unprocessable } from '../lib/errors.js';

function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: number; cause?: { code?: number } };
  return e?.code === 11000 || e?.cause?.code === 11000;
}

export interface CreateOrderResult {
  order: OrderDoc;
  reused: boolean;
}

export async function createOrder(user: UserDoc, body: CreateOrderBody): Promise<CreateOrderResult> {
  if (body.idempotencyKey) {
    const existing = await Order.findOne({ userId: user._id, idempotencyKey: body.idempotencyKey });
    if (existing) return { order: existing, reused: true };
  }

  const settings = await getSettings();
  if (settings.maintenanceMode && user.role !== 'admin') {
    throw forbidden('Ordering is paused for maintenance');
  }

  // Price the service×country against the active (top-enabled) provider.
  if (!(await getCatalogProvider())) throw conflict('No SMS provider is enabled');
  const cat = await resolveForOrder(body.serviceId, body.countryId, settings);
  if (!cat) {
    throw conflict('No numbers available for that service and country right now');
  }

  const price = cat.priceMicro;
  if (body.maxPriceMicro != null && price > body.maxPriceMicro) {
    throw unprocessable('Current price is above your max price');
  }
  if (price > user.balanceMicro) throw paymentRequired();

  // Rent from the first provider in the fallback chain that has stock. The cap
  // is the active provider's *raw* price, so we're never billed above what we quoted.
  const rent = await rentWithFallback({
    serviceSlug: body.serviceId,
    countryCode: body.countryId,
    dialCode: '',
    maxPriceMicro: cat.rawPriceMicro,
  });

  const data = {
    userId: user._id,
    serviceId: body.serviceId,
    countryId: body.countryId,
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
    ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
    deliverAt: rent.result.mockDeliverAt ?? null,
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

  return { order: doc, reused: false };
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

  // Some providers still bill us if the number is dropped too early — hold the
  // user's cancel until the provider's minimum hold has elapsed (FloZap parity).
  const holdLeft = holdRemainingSeconds(order);
  if (holdLeft > 0) {
    const mins = Math.ceil(holdLeft / 60);
    throw conflict(
      `This number can't be canceled yet — ${order.providerLabel ?? order.provider} holds it for a few more minutes. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
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
