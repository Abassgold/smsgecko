import { Router } from 'express';
import { z } from 'zod';
import { adminOrdersQuery, objectId } from '@smsgecko/shared';
import { Order, type OrderDoc } from '../../models/Order.js';
import { SmsMessage } from '../../models/SmsMessage.js';
import { User } from '../../models/User.js';
import { refundWaitingOrder } from '../../lib/orderLifecycle.js';
import { pollOrderOnce } from '../../workers/index.js';
import { toOrderView } from '../orders/orders.mapper.js';
import { conflict, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';

const idParams = z.object({ id: objectId });

function toRow(o: OrderDoc, email: string) {
  return {
    id: o.id as string,
    status: o.status,
    user: { id: String(o.userId), email },
    service: o.serviceName,
    country: o.countryName,
    countryFlagEmoji: o.countryFlagEmoji,
    phoneNumber: o.phoneNumber,
    priceMicro: o.priceMicro,
    providerCostMicro: o.providerCostMicro ?? null,
    provider: o.provider,
    providerLabel: o.providerLabel ?? null,
    otpCode: o.otpCode ?? null,
    createdAt: (o.get('createdAt') as Date).toISOString(),
    completedAt: o.completedAt ? o.completedAt.toISOString() : null,
    expiresAt: o.expiresAt.toISOString(),
    lastPolledAt: o.lastPolledAt ? o.lastPolledAt.toISOString() : null,
  };
}

export const adminOrderRouter = Router();

adminOrderRouter.get('/', async (req, res) => {
  const { status, provider, serviceId, countryId, userId, q, page, limit } = parse(
    adminOrdersQuery,
    req.query,
  );
  const filter: Record<string, unknown> = {};
  if (status === 'active') filter.status = 'waiting';
  else if (status !== 'all') filter.status = status;
  if (provider) filter.provider = provider;
  if (serviceId) filter.serviceId = serviceId;
  if (countryId) filter.countryId = countryId;
  if (userId) filter.userId = userId;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ phoneNumber: rx }, { providerRef: rx }];
  }

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  const emails = new Map(
    (await User.find({ _id: { $in: items.map((o) => o.userId) } }, { email: 1 })).map((u) => [
      String(u._id),
      u.email,
    ]),
  );
  res.json({
    items: items.map((o) => toRow(o, emails.get(String(o.userId)) ?? '—')),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

adminOrderRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const order = await Order.findById(id);
  if (!order) throw notFound('Order not found');
  const messages = await SmsMessage.find({ orderId: order._id }).sort({ receivedAt: 1 });
  res.json(toOrderView(order, messages));
});

adminOrderRouter.post('/:id/cancel', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const order = await Order.findById(id);
  if (!order) throw notFound('Order not found');
  if (order.status !== 'waiting') throw conflict(`Order is already ${order.status}`);
  const canceled = await refundWaitingOrder(order._id, 'canceled');
  res.json(toOrderView(canceled ?? (await Order.findById(order._id))!));
});

adminOrderRouter.post('/:id/repoll', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const order = await Order.findById(id);
  if (!order) throw notFound('Order not found');
  if (order.status === 'waiting') await pollOrderOnce(order);
  const fresh = await Order.findById(order._id);
  const messages = await SmsMessage.find({ orderId: order._id }).sort({ receivedAt: 1 });
  res.json(toOrderView(fresh!, messages));
});
