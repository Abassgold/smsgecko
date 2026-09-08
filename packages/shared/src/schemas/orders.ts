import { z } from 'zod';
import { ORDER_STATUSES } from '../constants';
import { objectId } from './common';

export const createOrderBody = z.object({
  serviceId: objectId,
  countryId: objectId,
  /** Pin a specific offer; otherwise the cheapest in-stock one is used. */
  offerId: objectId.optional(),
  /** Refuse if the chosen offer costs more than this (micro-USD). */
  maxPriceMicro: z.number().int().positive().optional(),
  /** Retry-safe create: same key for the same user returns the same order. */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const smsMessageView = z.object({
  id: z.string(),
  sender: z.string(),
  text: z.string(),
  parsedOtp: z.string().nullable(),
  receivedAt: z.string(),
});
export type SmsMessageView = z.infer<typeof smsMessageView>;

export const orderView = z.object({
  id: z.string(),
  status: z.enum(ORDER_STATUSES),
  service: z.object({ id: z.string(), name: z.string(), iconKey: z.string() }),
  country: z.object({ id: z.string(), name: z.string(), code: z.string(), flagEmoji: z.string() }),
  phoneNumber: z.string(),
  priceMicro: z.number().int(),
  otpCode: z.string().nullable(),
  messages: z.array(smsMessageView),
  /** Seconds until auto-expiry; 0 once resolved. */
  secondsLeft: z.number().int().nonnegative(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
});
export type OrderView = z.infer<typeof orderView>;

export const ordersQuery = z.object({
  status: z.enum(['all', ...ORDER_STATUSES, 'active']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const orderStatsResponse = z.object({
  balanceMicro: z.number().int(),
  totalOrders: z.number().int(),
  activeOrders: z.number().int(),
  completedOrders: z.number().int(),
  successRate: z.number(), // 0..1
  spend30dMicro: z.number().int(),
  series: z.array(
    z.object({
      date: z.string(), // YYYY-MM-DD
      orders: z.number().int(),
      spendMicro: z.number().int(),
    }),
  ),
});
export type OrderStatsResponse = z.infer<typeof orderStatsResponse>;
