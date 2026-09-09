import type { ResolvedSettings } from './settings.js';

/** ISO 3166-1 alpha-2 → flag emoji (regional-indicator pair). '🏳️' fallback. */
export function iso2ToFlag(iso2?: string | null): string {
  const c = (iso2 ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🏳️';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65)));
}

type MarkupSettings = Pick<ResolvedSettings, 'numberMarkupPercent' | 'numberMarkupFlatMicro'>;

/** Provider raw price (micro-USD) → the customer-facing price with the admin markup. */
export function sellPriceMicro(rawMicro: number, s: MarkupSettings): number {
  const withPct = rawMicro * (1 + (s.numberMarkupPercent || 0) / 100);
  return Math.round(withPct) + (s.numberMarkupFlatMicro || 0);
}

/* ---------------- offer ids ---------------- */

/**
 * An offer id names one price tier of a service×country:
 *   "<serviceCode>::<countryCode>"        → the cheapest tier (index 0)
 *   "<serviceCode>::<countryCode>::<i>"   → tier i (0-based, cheapest-first)
 */
export function buildOfferId(serviceCode: string, countryCode: string, tierIndex = 0): string {
  return tierIndex > 0
    ? `${serviceCode}::${countryCode}::${tierIndex}`
    : `${serviceCode}::${countryCode}`;
}

export function parseOfferId(
  id: string,
): { serviceCode: string; countryCode: string; tierIndex: number } | null {
  const parts = String(id).split('::');
  if (parts.length < 2 || parts.length > 3) return null;
  const [serviceCode, countryCode, rawIdx] = parts;
  if (!serviceCode || !countryCode) return null;
  const tierIndex = rawIdx === undefined ? 0 : Number(rawIdx);
  if (!Number.isInteger(tierIndex) || tierIndex < 0) return null;
  return { serviceCode, countryCode, tierIndex };
}

/* ---------------- short-lived in-memory cache for provider catalog lists ---------------- */

interface CacheEntry {
  data: unknown;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 300_000; // 5 min

export async function catalogCached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const data = await load();
  cache.set(key, { data, at: Date.now() });
  return data;
}

export function bustCatalogCache(): void {
  cache.clear();
}
