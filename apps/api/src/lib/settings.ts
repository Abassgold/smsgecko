import { AFFILIATE_RATE, MIN_DEPOSIT_MICRO } from '@smsgecko/shared';
import { env } from '../config/env.js';
import { Setting } from '../models/Setting.js';

export interface ResolvedSettings {
  orderTtlSeconds: number;
  providerPollIntervalMs: number;
  mockSmsSuccessRate: number;
  mockSmsMinDelayMs: number;
  mockSmsMaxDelayMs: number;
  affiliateRatePct: number;
  minDepositMicro: number;
  signupsEnabled: boolean;
  maintenanceMode: boolean;
}

export const SETTINGS_DEFAULTS: ResolvedSettings = {
  orderTtlSeconds: env.ORDER_TTL_SECONDS,
  providerPollIntervalMs: 8000,
  mockSmsSuccessRate: env.MOCK_SMS_SUCCESS_RATE,
  mockSmsMinDelayMs: env.MOCK_SMS_MIN_DELAY_MS,
  mockSmsMaxDelayMs: env.MOCK_SMS_MAX_DELAY_MS,
  affiliateRatePct: Math.round(AFFILIATE_RATE * 100),
  minDepositMicro: MIN_DEPOSIT_MICRO,
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
