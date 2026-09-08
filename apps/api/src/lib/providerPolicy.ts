import type { OrderDoc } from '../models/Order.js';

/**
 * Per-provider minimum hold for a still-`waiting` order, in seconds.
 *
 * Mirrors FloZap's per-provider grace in `checkAndProcessRefunds`: some
 * upstreams still bill us for a rented number unless it is held for a while, so
 * those numbers are not auto-refunded (nor user-cancelable) until the hold has
 * elapsed. Providers that let us cancel for free hold for `0`.
 *
 * FloZap mapping: server1 -> hero_sms, server2 -> sms_pool, PN_USA -> daisy_sms.
 */
const PROVIDER_MIN_HOLD_SECONDS: Record<string, number> = {
  mock: 0,
  daisy_sms: 0,
  sms_pool: 0,
  sms_code: 0,
  hero_sms: 600,
  sms_bower: 600,
};

/** Unknown / generic providers (e.g. custom_http) — be conservative, like FloZap's default branch. */
export const DEFAULT_MIN_HOLD_SECONDS = 600;

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
