import { AFFILIATE_RATE, MIN_DEPOSIT_MICRO } from '@smsgecko/shared';
import type { KorapayCurrency } from '@smsgecko/shared';
import { env } from '../config/env.js';
import { Setting } from '../models/Setting.js';

export interface ResolvedSettings {
  orderTtlSeconds: number;
  providerPollIntervalMs: number;
  affiliateRatePct: number;
  minDepositMicro: number;
  /** Customer markup over the provider's raw number price. */
  numberMarkupPercent: number;
  numberMarkupFlatMicro: number;
  /** USD→local-currency rates for Korapay's African corridors. No live feed — admin sets them by hand. */
  korapayFxRates: Record<KorapayCurrency, number>;
  signupsEnabled: boolean;
  maintenanceMode: boolean;
}

export const SETTINGS_DEFAULTS: ResolvedSettings = {
  orderTtlSeconds: env.ORDER_TTL_SECONDS,
  providerPollIntervalMs: 8000,
  affiliateRatePct: Math.round(AFFILIATE_RATE * 100),
  minDepositMicro: MIN_DEPOSIT_MICRO,
  numberMarkupPercent: 0,
  numberMarkupFlatMicro: 0,
  korapayFxRates: { NGN: 1600, GHS: 12, KES: 129, ZAR: 16 },
  signupsEnabled: true,
  maintenanceMode: false,
};

let cache: { value: ResolvedSettings; at: number } | null = null;
const TTL_MS = 10_000;

/** Create the `global` settings doc from env defaults if it does not exist. */
export async function ensureSettings(): Promise<void> {
  await Setting.updateOne(
    { _id: 'global' },
    { $setOnInsert: { _id: 'global', ...SETTINGS_DEFAULTS } },
    { upsert: true },
  );
  cache = null;
}

/** Current runtime settings. Cached ~10s; falls back to env defaults on any error. */
export async function getSettings(): Promise<ResolvedSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const doc = await Setting.findById('global').lean();
    const value: ResolvedSettings = doc
      ? { ...SETTINGS_DEFAULTS, ...stripMeta(doc) }
      : SETTINGS_DEFAULTS;
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return SETTINGS_DEFAULTS;
  }
}

export async function updateSettings(
  patch: Partial<ResolvedSettings>,
): Promise<ResolvedSettings> {
  await Setting.updateOne({ _id: 'global' }, { $set: patch }, { upsert: true });
  cache = null;
  return getSettings();
}

export function bustSettingsCache(): void {
  cache = null;
}

function stripMeta(doc: Record<string, unknown>): Partial<ResolvedSettings> {
  const { _id, createdAt, updatedAt, __v, ...rest } = doc;
  void _id;
  void createdAt;
  void updatedAt;
  void __v;
  return rest as Partial<ResolvedSettings>;
}
