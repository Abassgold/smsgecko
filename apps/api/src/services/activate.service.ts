import { MICRO_PER_USD } from '@smsgecko/shared';
import { priceTiers, priceTiersAllServices, priceTiersByCountry, searchCountries, searchServices } from './catalog.service.js';
import { getSettings } from '../lib/settings.js';

type Tier = Awaited<ReturnType<typeof priceTiers>>[number];

const usd4 = (micro: number) => (micro / MICRO_PER_USD).toFixed(4);
/** A tier is on sale unless the provider says it has none. Unknown stock counts as available. */
const inStock = (t: Tier) => t.stock == null || t.stock > 0;

/** Resolve a country the way the text API receives it: the catalog's own id (numeric on SMS-Activate-style upstreams), case-insensitive. */
export async function findCountryCode(raw: string | undefined): Promise<string | null> {
  const want = String(raw ?? '').trim().toLowerCase();
  if (!want) return null;
  const all = await searchCountries();
  return all.find((c) => c.code.toLowerCase() === want)?.code ?? null;
}

export async function findServiceCode(raw: string | undefined): Promise<string | null> {
  const want = String(raw ?? '').trim().toLowerCase();
  if (!want) return null;
  const all = await searchServices();
  return all.find((s) => s.id.toLowerCase() === want)?.id ?? null;
}

/**
 * getPrices / getPricesV2: `{ "<countryId>": { "<serviceCode>": … } }`. With a service: that service in every country
 * (one live provider call, or the stored catalog). With NO service: every service, from the stored catalog only
 * (null when there is none fresh: pricing everything live would be hundreds of provider calls).
 */
export async function pricesFor(serviceCode: string | null, countryCode: string | null, v2: boolean) {
  const settings = await getSettings();
  // service → country → tiers
  let all: Map<string, Map<string, Tier[]>> | null;
  if (serviceCode) {
    const byCountry = countryCode
      ? new Map([[countryCode, await priceTiers(serviceCode, countryCode, settings)]])
      : await priceTiersByCountry(serviceCode, settings);
    all = new Map([[serviceCode, byCountry]]);
  } else {
    all = await priceTiersAllServices(settings, countryCode ?? undefined);
    if (!all) return null;
  }

  const out: Record<string, Record<string, unknown>> = {};
  for (const [service, byCountry] of all) {
    for (const [country, allTiers] of byCountry) {
      const tiers = allTiers.filter(inStock);
      if (!tiers.length) continue;
      if (!v2) {
        // Providers that do not report stock still sell: show 1 rather than a 0 that tells clients it is sold out.
        const count = tiers.reduce((n, t) => n + (t.stock ?? 1), 0);
        (out[country] ??= {})[service] = { cost: usd4(tiers[0]!.priceMicro), count };
        continue;
      }
      // Every price tier, with the numbers on sale at it (tiers sharing a price are merged).
      const prices: Record<string, number> = {};
      for (const t of tiers) prices[usd4(t.priceMicro)] = (prices[usd4(t.priceMicro)] ?? 0) + (t.stock ?? 1);
      (out[country] ??= {})[service] = { prices, saleAveragePrice: tiers[0]!.priceMicro / MICRO_PER_USD };
    }
  }
  return out;
}

export async function servicesList() {
  return (await searchServices()).map((s) => ({ code: s.id, name: s.name }));
}

export async function countriesList() {
  return (await searchCountries()).map((c) => ({ id: c.id, eng: c.name, iso: iso2Of(c.flagEmoji) }));
}

/** Flag emoji → ISO-2 (the catalog view only carries the emoji). '' when there is no flag. */
function iso2Of(flag: string): string {
  const pts = [...flag].map((ch) => ch.codePointAt(0)!);
  if (pts.length !== 2 || pts.some((p) => p < 0x1f1e6 || p > 0x1f1ff)) return '';
  return String.fromCharCode(...pts.map((p) => p - 0x1f1e6 + 97));
}
