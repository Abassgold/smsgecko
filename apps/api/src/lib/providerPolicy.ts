import type { OrderDoc } from '../models/Order.js';

/**
 * Per-provider minimum hold for a still-`waiting` order, in seconds.
 *
 * Some upstreams still bill us for a rented number unless it is held for a
 * short lock-in period, so those numbers are not auto-refunded (nor
 * user-cancelable) until the hold has elapsed. Providers that let us cancel for
 * free hold for `0`.
 */
const PROVIDER_MIN_HOLD_SECONDS: Record<string, number> = {
  mock: 0,
  daisy_sms: 0,
  sms_pool: 0,
  sms_code: 0,
  hero_sms: 180,
  sms_bower: 180,
};

/** Unknown / generic providers (e.g. custom_http) — hold for the same short lock-in. */
export const DEFAULT_MIN_HOLD_SECONDS = 180;

export function minHoldSecondsFor(providerKey: string): number {
  return PROVIDER_MIN_HOLD_SECONDS[providerKey] ?? DEFAULT_MIN_HOLD_SECONDS;
}

/**
 * Seconds left before `order` may be canceled/auto-refunded; 0 once the
 * provider's minimum hold has elapsed since the order was created.
 */
export function holdRemainingSeconds(order: OrderDoc): number {
  const minHold = minHoldSecondsFor(order.provider);
  if (minHold <= 0) return 0;
  const heldMs = Date.now() - (order.get('createdAt') as Date).getTime();
  return Math.max(0, Math.ceil(minHold - heldMs / 1000));
}
