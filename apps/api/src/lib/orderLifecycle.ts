import mongoose from 'mongoose';
import { Order, type OrderDoc } from '../models/Order.js';
import { SmsMessage } from '../models/SmsMessage.js';
import { Transaction } from '../models/Transaction.js';
import { notify } from '../models/Notification.js';
import { User } from '../models/User.js';
import { getProviderForOrder, recordOtpReceived } from '../providers/sms/registry.js';
import type { PollMessage } from '../providers/sms/types.js';
import { parseOtp } from './smsTemplates.js';
import { credit } from './ledger.js';
import { notifyUser } from '../services/push.service.js';
import { dispatchWebhook, type WebhookEvent } from './webhooks.js';

/** Fire-and-forget: never let a webhook delivery affect the caller. */
function fireWebhook(order: OrderDoc, event: WebhookEvent, otpMessage: string | null = null): void {
  void User.findById(order.userId).then((user) => {
    if (user) void dispatchWebhook(user, event, order, otpMessage);
  });
}

/**
 * Apply a provider-delivered OTP to a still-`waiting` order: mark it completed,
 * store the code + message(s), notify the user, bump provider stats. Guarded so
 * concurrent workers can't double-apply. Returns the updated order or null.
 */
export async function applyOtpToOrder(
  order: OrderDoc,
  code: string | null | undefined,
  messages: PollMessage[] = [],
): Promise<OrderDoc | null> {
  const primary = messages[0];
  const otp = code ?? (primary ? parseOtp(primary.text) : null) ?? null;

  // A code already delivered on this activation (an earlier one, shown again by the provider until the new SMS lands)
  // must never complete the order a second time.
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: 'waiting', ...(otp ? { otpHistory: { $ne: otp } } : {}) },
    { $set: { status: 'completed', otpCode: otp, completedAt: new Date(), deliverAt: null } },
    { returnDocument: 'after' },
  );
  if (!updated) return null;

  const fallbackText = otp ? `Your code is ${otp}` : null;
  // `providerLabel` / `provider` name our upstream reseller (e.g. "tiger-sms") —
  // admin-only. Adapters rarely know the real SMS sender, so anything empty,
  // generic, or naming the reseller is shown as the service name instead.
  const hidden = new Set(
    [updated.providerLabel, updated.provider, 'sms'].filter(Boolean).map((v) => String(v).toLowerCase()),
  );
  const safeSender = (sender: string | undefined) =>
    sender?.trim() && !hidden.has(sender.trim().toLowerCase()) ? sender.trim() : updated.serviceName;
  const rows = (
    messages.length ? messages : fallbackText ? [{ sender: updated.serviceName, text: fallbackText }] : []
  ).map((m) => ({
    orderId: updated._id,
    userId: updated.userId,
    sender: safeSender(m.sender),
    text: m.text,
    parsedOtp: parseOtp(m.text) ?? otp,
    receivedAt: m.receivedAt ?? new Date(),
  }));
  if (rows.length) await SmsMessage.insertMany(rows);

  await recordOtpReceived(updated);
  if (updated.source !== 'api') {
    await notify(
      updated.userId,
      'otp_received',
      `${updated.serviceName} code received`,
      otp ? `Your code is ${otp}.` : 'A message arrived for your number.',
      updated._id,
    );
  }
  // A browser notification for anyone who opted in on this device; fire-and-forget, never delays or fails the order.
  void notifyUser(String(updated.userId), {
    title: `${updated.serviceName}: ${otp ?? 'code received'}`,
    body: updated.phoneNumber ? `SMS received for ${updated.phoneNumber}` : 'SMS received',
    url: `/orders/${updated.publicId ?? String(updated._id)}`,
    tag: `order-${String(updated._id)}`,
  });
  fireWebhook(updated, 'order.otp_received', primary?.text ?? fallbackText);

  return updated;
}

/**
 * MONEY ONLY: flip a `waiting` order to a terminal status and refund it, once (the status flip is the guard: a user
 * cancel and the expiry worker can race, only one wins). It does NOT talk to the provider, so call it only when the
 * provider has already confirmed (see {@link cancelWithProvider}) or never rented a number (a failed purchase).
 *
 * Refund a `waiting` order and move it to a terminal status (`expired` from the
 * worker, `canceled` from the user/admin). Releases
 * the number with its provider. Guarded + idempotent.
 */
export async function refundWaitingOrder(
  orderId: OrderDoc['_id'] | string,
  to: 'expired' | 'canceled',
): Promise<OrderDoc | null> {
  const now = new Date();
  const patch =
    to === 'expired' ? { status: 'expired' } : { status: 'canceled', canceledAt: now };

  // The status flip and the refund happen in ONE database transaction: a crash between them cannot leave an order
  // closed with no money returned, or money returned on an order that is still open.
  const session = await mongoose.startSession();
  let order: OrderDoc | null = null;
  try {
    await session.withTransaction(async () => {
      order = null;
      const flipped = await Order.findOneAndUpdate(
        { _id: orderId, status: 'waiting' },
        { $set: { ...patch, deliverAt: null } },
        { returnDocument: 'after', session },
      );
      if (!flipped) return;

      // Pairs with the charge it reverses. Most orders only have the one creation
      // charge, but a reactivated order has a second, separate charge — refund
      // that one's reference instead so the pairing stays correct.
      const reactivated = await Transaction.exists({
        orderId: flipped._id,
        reference: `${flipped._id}_reactivate`,
      }).session(session);
      await credit(flipped.userId, flipped.priceMicro, {
        type: 'refund',
        description: to === 'expired' ? 'Order expired — refund' : 'Order canceled — refund',
        orderId: flipped._id,
        reference: reactivated ? `${flipped._id}_reactivate_R` : `${flipped._id}_R`,
        session,
      });
      order = flipped;
    });
  } finally {
    await session.endSession();
  }
  if (!order) return null;
  const refunded: OrderDoc = order;
  if (to === 'expired' && refunded.source !== 'api') {
    await notify(
      refunded.userId,
      'order_expired',
      `${refunded.serviceName} order expired`,
      'No code arrived — you were refunded.',
      refunded._id,
    );
  }
  // order.expired / order.canceled webhooks are switched off for now.
  // fireWebhook(order, to === 'expired' ? 'order.expired' : 'order.canceled');

  return refunded;
}


export type CancelOutcome =
  /** Cancelled at the provider and refunded. */
  | { kind: 'refunded'; order: OrderDoc | null }
  /** The SMS beat the cancel: the number stays active and the customer keeps the code. */
  | { kind: 'received'; order: OrderDoc | null }
  /** The provider refuses cancels this soon after purchase. */
  | { kind: 'too_early' };

/**
 * Cancel a waiting order the way manesms does: ask the provider FIRST and refund only when it accepts. Throws when the
 * provider cannot be reached or answers something unrecognised, so nobody is refunded on a guess.
 */
export async function cancelWithProvider(order: OrderDoc, to: 'expired' | 'canceled'): Promise<CancelOutcome> {
  // Never rented (or a legacy row with no reference): nothing upstream to cancel.
  if (!order.providerRef) return { kind: 'refunded', order: await refundWaitingOrder(order._id, to) };

  const provider = await getProviderForOrder(order);
  const res = await provider.release(order.providerRef);
  if (res.status === 'too_early') return { kind: 'too_early' };
  if (res.status === 'received') {
    const msgs = res.code ? [{ sender: order.serviceName, text: res.code }] : [];
    const updated = res.code ? await applyOtpToOrder(order, res.code, msgs) : null;
    if (updated) await provider.finish?.(order.providerRef).catch(() => undefined);
    return { kind: 'received', order: updated };
  }
  return { kind: 'refunded', order: await refundWaitingOrder(order._id, to) };
}

/**
 * An order that was waiting for ANOTHER sms goes back to `completed` with its last delivered code: the first code was
 * delivered and paid for, so there is nothing to refund when that wait is cancelled or runs out.
 */
export async function revertToCompleted(orderId: OrderDoc['_id'] | string): Promise<boolean> {
  const o = await Order.findOne({ _id: orderId, status: 'waiting', 'otpHistory.0': { $exists: true } });
  if (!o) return false;
  const last = o.otpHistory[o.otpHistory.length - 1]!;
  const res = await Order.updateOne(
    { _id: orderId, status: 'waiting' },
    { $set: { status: 'completed', otpCode: last, completedAt: new Date() } },
  );
  return res.modifiedCount > 0;
}
