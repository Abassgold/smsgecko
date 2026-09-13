export const ORDER_STATUSES = ['waiting', 'completed', 'canceled', 'expired'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = ['waiting'];

/** Which surface created the order: the dashboard (session cookie) or the public API (Bearer key). */
export const ORDER_SOURCES = ['web', 'api'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const TRANSACTION_TYPES = [
  'deposit',
  'order_payment',
  'refund',
  'affiliate_payout',
  'adjustment',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const DEPOSIT_METHODS = ['mock', 'crypto_usdt', 'ewallet', 'qris'] as const;
export type DepositMethod = (typeof DEPOSIT_METHODS)[number];

export const DEPOSIT_STATUSES = ['pending', 'confirmed', 'failed', 'expired'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export const TICKET_STATUSES = ['open', 'pending', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'otp_received',
  'order_expired',
  'deposit_confirmed',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Current affiliate terms version a user must accept before earning. */
export const AFFILIATE_TERMS_VERSION = 'affiliate-terms-2026-07-25-v1';
/** Affiliate commission rate (3.00%). */
export const AFFILIATE_RATE = 0.03;

/** Minimum deposit: $0.50. */
export const MIN_DEPOSIT_MICRO = 500_000;

export const API_KEY_LIVE_PREFIX = 'smsg_live_';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
