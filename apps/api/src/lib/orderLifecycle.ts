import { Order, type OrderDoc } from '../models/Order.js';
import { SmsMessage } from '../models/SmsMessage.js';
import { notify } from '../models/Notification.js';
import { getProviderForOrder, recordOtpReceived } from '../providers/sms/registry.js';
import type { PollMessage } from '../providers/sms/types.js';
import { parseOtp } from './smsTemplates.js';
import { credit } from './ledger.js';

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

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: 'waiting' },
    { $set: { status: 'completed', otpCode: otp, completedAt: new Date(), deliverAt: null } },
    { returnDocument: 'after' },
  );
  if (!updated) return null;

  const rows = (messages.length ? messages : otp ? [{ sender: updated.providerLabel ?? 'SMS', text: `Your code is ${otp}` }] : []).map(
    (m) => ({
      orderId: updated._id,
      userId: updated.userId,
      sender: m.sender,
      text: m.text,
      parsedOtp: parseOtp(m.text) ?? otp,
      receivedAt: m.receivedAt ?? new Date(),
    }),
  );
  if (rows.length) await SmsMessage.insertMany(rows);

  await recordOtpReceived(updated);
  await notify(
    updated.userId,
    'otp_received',
    `${updated.serviceName} code received`,
    otp ? `Your code is ${otp}.` : 'A message arrived for your number.',
    updated._id,
  );

  return updated;
}

/**
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

  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: 'waiting' },
    { $set: { ...patch, deliverAt: null } },
    { returnDocument: 'after' },
  );
  if (!order) return null;

  await credit(order.userId, order.priceMicro, {
    type: 'refund',
    description: 'Order canceled — refund',
    orderId: order._id,
  });
  try {
    // Cancel with the provider that actually rented this number — resolved from
    // order.providerConfigId, so it still works after the admin switches the
    // active provider or disables this one.
    const provider = await getProviderForOrder(order);
    await provider.release(order.providerRef);
  } catch {
    /* best-effort */
  }

  if (to === 'expired') {
    await notify(
      order.userId,
      'order_expired',
      `${order.serviceName} order expired`,
      'No code arrived — you were refunded.',
      order._id,
    );
  }

  return order;
}
