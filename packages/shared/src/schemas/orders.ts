import type { OrderStatus } from '../constants';

export interface CreateOrderBody {
  /** The active provider's service code (from GET /v1/catalog/services `.id`). */
  serviceId: string;
  /** The active provider's country code (from GET /v1/catalog/countries `.id`). */
  countryId: string;
  /** Refuse if the current price is above this (micro-USD, after markup). */
  maxPriceMicro?: number;
  /** Retry-safe create: same key for the same user returns the same order. */
  idempotencyKey?: string;
}

export interface SmsMessageView {
  id: string;
  sender: string;
  text: string;
  parsedOtp: string | null;
  receivedAt: string;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  service: { id: string; name: string; iconKey: string };
  country: { id: string; name: string; code: string; flagEmoji: string };
  phoneNumber: string;
  priceMicro: number;
  otpCode: string | null;
  messages: SmsMessageView[];
  /** Seconds until auto-expiry; 0 once resolved. */
  secondsLeft: number;
  /**
   * Seconds left on the post-purchase cancel lock. While > 0 the number cannot
   * be canceled (the cancel button should stay disabled with this countdown);
   * 0 means cancel is allowed.
   */
  cancelLockSeconds: number;
  createdAt: string;
  completedAt: string | null;
  canceledAt: string | null;
}

/** `status` filter accepts every order status plus `all` and `active`. */
export type OrdersStatusFilter = OrderStatus | 'all' | 'active';

export interface OrderStatsResponse {
  balanceMicro: number;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  /** 0..1 */
  successRate: number;
  spend30dMicro: number;
  series: Array<{
    /** YYYY-MM-DD */
    date: string;
    orders: number;
    spendMicro: number;
  }>;
}
