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
