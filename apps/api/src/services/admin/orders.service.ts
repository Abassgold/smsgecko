import type { AdminOrderRow } from '@smsgecko/shared';
import { Order, type OrderDoc } from '../../models/Order.js';
import { SmsMessage } from '../../models/SmsMessage.js';
import { Transaction, type TransactionDoc } from '../../models/Transaction.js';
import { User } from '../../models/User.js';
import { refundWaitingOrder } from '../../lib/orderLifecycle.js';
import { pollOrderOnce } from '../../workers/index.js';
import { conflict, notFound } from '../../lib/errors.js';
import { toOrderView } from '../orders.mapper.js';
import { logAdminAction } from '../../lib/adminLog.js';
import type { AdminOrdersQuery } from '../../lib/validation/admin/orders.schema.js';

function toRow(o: OrderDoc, email: string, payment?: TransactionDoc): AdminOrderRow {
  const balanceAfterMicro = payment ? payment.balanceAfterMicro : null;
  const balanceBeforeMicro = payment
    ? (payment.balanceBeforeMicro ?? payment.balanceAfterMicro - payment.amountMicro)
    : null;
  return {
    id: o.id as string,
    status: o.status,
    source: o.source,
    user: { id: String(o.userId), email },
    service: o.serviceName,
    country: o.countryName,
    countryFlagEmoji: o.countryFlagEmoji,
    phoneNumber: o.phoneNumber,
    priceMicro: o.priceMicro,
    balanceBeforeMicro,
    balanceAfterMicro,
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

export async function listOrders(query: AdminOrdersQuery) {
  const { status, provider, serviceId, countryId, userId, q, page, limit } = query;
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
  const [emailRows, payments] = await Promise.all([
    User.find({ _id: { $in: items.map((o) => o.userId) } }, { email: 1 }),
    Transaction.find({ orderId: { $in: items.map((o) => o._id) }, type: 'order_payment' }),
  ]);
  const emails = new Map(emailRows.map((u) => [String(u._id), u.email]));
  const paymentByOrder = new Map(payments.map((t) => [String(t.orderId), t]));

  return {
    items: items.map((o) =>
      toRow(o, emails.get(String(o.userId)) ?? '—', paymentByOrder.get(String(o._id))),
    ),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getOrderDetail(id: string) {
  const order = await Order.findById(id);
  if (!order) throw notFound('Order not found');
  const messages = await SmsMessage.find({ orderId: order._id }).sort({ receivedAt: 1 });
  return toOrderView(order, messages);
}

export async function cancelOrder(id: string, actingUserId: string) {
  const order = await Order.findById(id);
  if (!order) throw notFound('Order not found');
  if (order.status !== 'waiting') throw conflict(`Order is already ${order.status}`);
  const canceled = await refundWaitingOrder(order._id, 'canceled');
  void logAdminAction(
    actingUserId,
    'order_cancel',
    { type: 'order', id },
    `${order.phoneNumber} — refunded`,
  );
  return toOrderView(canceled ?? (await Order.findById(order._id))!);
}

export async function repollOrder(id: string) {
  const order = await Order.findById(id);
  if (!order) throw notFound('Order not found');
  if (order.status === 'waiting') await pollOrderOnce(order);
  const fresh = await Order.findById(order._id);
  const messages = await SmsMessage.find({ orderId: order._id }).sort({ receivedAt: 1 });
  return toOrderView(fresh!, messages);
}
