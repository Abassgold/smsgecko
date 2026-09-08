import { formatUsd } from '@smsgecko/shared';
import type { OrderDoc } from '../../models/Order.js';
import type { SmsMessageDoc } from '../../models/SmsMessage.js';

/** micro-USD -> bare USD string like "0.5" / "0.004" (no symbol). */
export function usdString(micro: number): string {
  return formatUsd(micro, { symbol: false, minDecimals: 1 });
}

export function toV2Order(order: OrderDoc, messages: SmsMessageDoc[] = []) {
  return {
    id: order.id as string,
    status: order.status,
    product: { service: order.serviceName, country: order.countryName },
    phone_number: order.phoneNumber,
    price: usdString(order.priceMicro),
    otp_code: order.otpCode ?? null,
    sms: messages.map((m) => ({
      sender: m.sender,
      text: m.text,
      received_at: m.receivedAt.toISOString(),
    })),
    created_at: (order.get('createdAt') as Date).toISOString(),
    expires_at: order.expiresAt.toISOString(),
    finished_at: order.finishedAt ? order.finishedAt.toISOString() : null,
  };
}
