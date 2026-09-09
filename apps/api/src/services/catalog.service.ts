import type { CountryView, OfferView, QuoteResponse, ServiceView } from '@smsgecko/shared';
import { getCatalogProvider } from '../providers/sms/registry.js';
import type {
  CatalogCountry,
  CatalogPrice,
  CatalogService,
  SmsProvider,
} from '../providers/sms/types.js';
import { bustCatalogCache, catalogCached, iso2ToFlag, sellPriceMicro } from '../lib/catalog.js';
import { getSettings, type ResolvedSettings } from '../lib/settings.js';
import { logger } from '../lib/logger.js';

export { bustCatalogCache };

async function active(): Promise<{ id: string; provider: SmsProvider } | null> {
  const cat = await getCatalogProvider();
  return cat ? { id: String(cat.cfg._id), provider: cat.provider } : null;
}

async function services(): Promise<CatalogService[]> {
  const a = await active();
  if (!a) return [];
  return catalogCached(`${a.id}:services`, () =>
    a.provider.listServices().catch((err) => {
      logger.warn({ err }, '[catalog] listServices failed');
      return [];
    }),
  );
}

async function countries(): Promise<CatalogCountry[]> {
  const a = await active();
  if (!a) return [];
  return catalogCached(`${a.id}:countries`, () =>
    a.provider.listCountries().catch((err) => {
      logger.warn({ err }, '[catalog] listCountries failed');
      return [];
    }),
  );
}

/** Uncached — prices move. Returns [] on any provider/network error. */
async function prices(serviceCode: string, countryCode?: string): Promise<CatalogPrice[]> {
  const a = await active();
  if (!a) return [];
  try {
    return await a.provider.listPrices({ serviceCode, countryCode });
  } catch (err) {
    logger.warn({ err, serviceCode, countryCode }, '[catalog] listPrices failed');
    return [];
  }
}


function toServiceView(s: CatalogService): ServiceView {
  return { id: s.code, slug: s.code, name: s.name, iconKey: '', popular: false };
}

function toCountryView(c: CatalogCountry): CountryView {
  return {
    id: c.code,
    code: c.code,
    name: c.name,
    dialCode: c.dialCode ?? '',
    flagEmoji: iso2ToFlag(c.iso2),
  };
}

/**
 * The active provider's full service list (each provider normalises its own
 * response shape in its adapter). `q` is an optional server-side filter; `limit`
 * an optional cap — omit both to hand the frontend everything.
 */
export async function searchServices(q?: string, limit?: number): Promise<ServiceView[]> {
  const needle = q?.trim().toLowerCase();
  let rows = await services();
  if (needle) {
    rows = rows.filter(
      (s) => s.name.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle),
    );
  }
  if (limit) rows = rows.slice(0, limit);
  return rows.map(toServiceView);
}

/** The active provider's full country list. Same `q` / `limit` semantics as {@link searchServices}. */
export async function searchCountries(q?: string, limit?: number): Promise<CountryView[]> {
  const needle = q?.trim().toLowerCase();
  let rows = await countries();
  if (needle) {
    rows = rows.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle),
    );
  }
  if (limit) rows = rows.slice(0, limit);
  return rows.map(toCountryView);
}

/** Markup-applied price tiers for a service×country, cheapest first. */
export async function priceTiers(
  serviceCode: string,
  countryCode: string,
  settings?: ResolvedSettings,
): Promise<Array<{ rawPriceMicro: number; priceMicro: number; stock: number | null; operator: string | null }>> {
  const s = settings ?? (await getSettings());
  const tiers = (await prices(serviceCode, countryCode))
    .filter((t) => t.priceMicro > 0)
    .map((t) => ({
      rawPriceMicro: t.priceMicro,
      priceMicro: sellPriceMicro(t.priceMicro, s),
      stock: t.stock ?? null,
      operator: t.operator ?? null,
    }))
    .sort((a, b) => a.rawPriceMicro - b.rawPriceMicro);
  // Dedup identical raw prices.
  return tiers.filter((t, i) => i === 0 || t.rawPriceMicro !== tiers[i - 1]!.rawPriceMicro);
}

export async function listOffers(serviceCode: string, countryCode: string): Promise<OfferView[]> {
  const tiers = await priceTiers(serviceCode, countryCode);
  return tiers.map((t, i) => ({
    id: i === 0 ? `${serviceCode}::${countryCode}` : `${serviceCode}::${countryCode}::${i}`,
    serviceId: serviceCode,
    countryId: countryCode,
    operator: t.operator,
    priceMicro: t.priceMicro,
    stock: t.stock ?? 0,
  }));
}

export async function getQuote(serviceCode: string, countryCode: string): Promise<QuoteResponse> {
  const tiers = await priceTiers(serviceCode, countryCode);
  // Cheapest tier that isn't explicitly out of stock (null = provider didn't say).
  const pick = tiers.find((t) => t.stock == null || t.stock > 0) ?? null;
  return {
    serviceId: serviceCode,
    countryId: countryCode,
    available: Boolean(pick),
    bestOffer: pick
      ? {
          id: `${serviceCode}::${countryCode}`,
          serviceId: serviceCode,
          countryId: countryCode,
          operator: pick.operator,
          priceMicro: pick.priceMicro,
          stock: pick.stock ?? 0,
        }
      : null,
  };
}


export interface ResolvedOrderCatalog {
  serviceSlug: string;
  serviceName: string;
  serviceIconKey: string;
  countryName: string;
  countryCode: string;
  countryFlagEmoji: string;
  rawPriceMicro: number;
  priceMicro: number;
}

export async function resolveForOrder(
  serviceCode: string,
  countryCode: string,
  settings: ResolvedSettings,
): Promise<ResolvedOrderCatalog | null> {
  const tiers = await priceTiers(serviceCode, countryCode, settings);
  const pick = tiers.find((t) => t.stock == null || t.stock > 0);
  if (!pick) return null;

  const [svcList, ctryList] = await Promise.all([services(), countries()]);
  const svc = svcList.find((s) => s.code === serviceCode);
  const ctry = ctryList.find((c) => c.code === countryCode);

  return {
    serviceSlug: serviceCode,
    serviceName: svc?.name ?? serviceCode,
    serviceIconKey: '',
    countryName: ctry?.name ?? countryCode,
    countryCode,
    countryFlagEmoji: iso2ToFlag(ctry?.iso2),
    rawPriceMicro: pick.rawPriceMicro,
    priceMicro: pick.priceMicro,
  };
}
