import type { CreateOrderBody } from '@smsgecko/shared';
import { mongoose, supportsTransactions } from '../db/mongoose.js';
import { Order, type OrderDoc } from '../models/Order.js';
import { Offer, type OfferDoc } from '../models/Offer.js';
import { Service } from '../models/Service.js';
import { Country } from '../models/Country.js';
import { SmsMessage } from '../models/SmsMessage.js';
import type { UserDoc } from '../models/User.js';
import { rentWithFallback, releaseNumber } from '../providers/sms/registry.js';
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

  const [service, country] = await Promise.all([
    Service.findById(body.serviceId),
    Country.findById(body.countryId),
  ]);
  if (!service) throw notFound('Service not found');
  if (!country) throw notFound('Country not found');

  let offer: OfferDoc | null;
  if (body.offerId) {
    offer = await Offer.findOne({
      _id: body.offerId,
      serviceId: service._id,
      countryId: country._id,
      active: true,
    });
    if (!offer) throw notFound('Offer not found for that service and country');
  } else {
    offer = await Offer.findOne({
      serviceId: service._id,
      countryId: country._id,
      active: true,
      stock: { $gt: 0 },
    }).sort({ priceMicro: 1 });
    if (!offer) throw conflict('No numbers available for that service and country right now');
  }

  if (body.maxPriceMicro != null && offer.priceMicro > body.maxPriceMicro) {
    throw unprocessable('Current price is above your max price');
  }
  if (offer.priceMicro > user.balanceMicro) throw paymentRequired();

  const settings = await getSettings();
  if (settings.maintenanceMode && user.role !== 'admin') {
    throw forbidden('Ordering is paused for maintenance');
  }

  // Rent a number from the first enabled provider in the fallback chain.
  const rent = await rentWithFallback({
    serviceSlug: service.slug,
    countryCode: country.code,
    dialCode: country.dialCode,
    maxPriceMicro: offer.priceMicro,
  });

  const data = {
    userId: user._id,
    serviceId: service._id,
    countryId: country._id,
    offerId: offer._id,
    serviceSlug: service.slug,
    serviceName: service.name,
    serviceIconKey: service.iconKey,
    countryName: country.name,
    countryCode: country.code,
    countryFlagEmoji: country.flagEmoji,
    phoneNumber: rent.result.phoneNumber,
    priceMicro: offer.priceMicro,
    status: 'waiting' as const,
    provider: rent.providerKey,
    providerConfigId: rent.providerConfigId,
    providerLabel: rent.providerLabel,
    providerRef: rent.result.providerRef,
    providerCostMicro: rent.result.costMicro ?? null,
    ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
    deliverAt: rent.result.mockDeliverAt ?? null,
    // Never auto-expire before the provider's minimum hold — some upstreams
    // still bill us for the number until then (mirrors FloZap's per-provider grace).
    expiresAt: new Date(
      Date.now() + Math.max(settings.orderTtlSeconds, minHoldSecondsFor(rent.providerKey)) * 1000,
    ),
  };

  const offerId = offer._id;
  const price = offer.priceMicro;

  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let created: OrderDoc | undefined;
      await session.withTransaction(async () => {
        const decremented = await Offer.findOneAndUpdate(
          { _id: offerId, stock: { $gt: 0 } },
          { $inc: { stock: -1 } },
          { session, returnDocument: 'after' },
        );
        if (!decremented) throw conflict('That number was just taken — please try again');

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
  const decremented = await Offer.findOneAndUpdate(
    { _id: offerId, stock: { $gt: 0 } },
    { $inc: { stock: -1 } },
    { returnDocument: 'after' },
  );
  if (!decremented) {
    await releaseNumber(rent.providerConfigId, rent.result.providerRef);
    throw conflict('That number was just taken — please try again');
  }

  let doc: OrderDoc;
  try {
    doc = await Order.create(data);
  } catch (err) {
    await Offer.updateOne({ _id: offerId }, { $inc: { stock: 1 } });
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
    await Offer.updateOne({ _id: offerId }, { $inc: { stock: 1 } });
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
