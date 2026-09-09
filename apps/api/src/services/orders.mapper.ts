import type { OrderView, SmsMessageView } from '@smsgecko/shared';
import type { OrderDoc } from '../models/Order.js';
import type { SmsMessageDoc } from '../models/SmsMessage.js';
import { holdRemainingSeconds } from '../lib/providerPolicy.js';

export function toSmsMessageView(m: SmsMessageDoc): SmsMessageView {
  return {
    id: m.id as string,
    sender: m.sender,
    text: m.text,
    parsedOtp: m.parsedOtp ?? null,
    receivedAt: m.receivedAt.toISOString(),
  };
}

export function toOrderView(order: OrderDoc, messages: SmsMessageDoc[] = []): OrderView {
  const now = Date.now();
  const secondsLeft =
    order.status === 'waiting'
      ? Math.max(0, Math.ceil((order.expiresAt.getTime() - now) / 1000))
      : 0;

  return {
    id: order.id as string,
    status: order.status,
    service: { id: String(order.serviceId), name: order.serviceName, iconKey: order.serviceIconKey },
    country: {
      id: String(order.countryId),
      name: order.countryName,
      code: order.countryCode,
      flagEmoji: order.countryFlagEmoji,
    },
    phoneNumber: order.phoneNumber,
    priceMicro: order.priceMicro,
    otpCode: order.otpCode ?? null,
    messages: messages.map(toSmsMessageView),
    secondsLeft,
    cancelLockSeconds: order.status === 'waiting' ? holdRemainingSeconds(order) : 0,
    createdAt: (order.get('createdAt') as Date).toISOString(),
    completedAt: order.completedAt ? order.completedAt.toISOString() : null,
    canceledAt: order.canceledAt ? order.canceledAt.toISOString() : null,
  };
}
