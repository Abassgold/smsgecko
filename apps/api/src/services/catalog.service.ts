import type {
  CountryView,
  OfferView,
  OperatorView,
  QuoteResponse,
  ServiceView,
} from '@smsgecko/shared';
import { getCatalogProvider } from '../providers/sms/registry.js';
import type {
  CatalogCountry,
  CatalogPrice,
  CatalogService,
  SmsProvider,
} from '../providers/sms/types.js';
import {
  bustCatalogCache,
  buildOfferId,
  catalogCached,
  iso2ToFlag,
  sellPriceMicro,
} from '../lib/catalog.js';
import { getSettings, type ResolvedSettings } from '../lib/settings.js';
import { logger } from '../lib/logger.js';

export { bustCatalogCache };

async function active(): Promise<{ id: string; provider: SmsProvider } | null> {
  const cat = await getCatalogProvider();
  return cat ? { id: String(cat.cfg._id), provider: cat.provider } : null;
}

// The catch has to sit OUTSIDE catalogCached, not inside its loader: catalogCached
// only sees whatever the loader resolves with, so if the loader itself swallowed
// the error and resolved to `[]`, that `[]` looks exactly like a genuinely empty
// catalog and gets memoized for the full TTL — one transient provider hiccup then
// leaves the storefront looking empty for minutes after the provider recovers.
// Letting the rejection propagate through catalogCached means a failure is never
// cached; only a real, successful (possibly empty) result is.
async function services(): Promise<CatalogService[]> {
  const a = await active();
  if (!a) return [];
  try {
    return await catalogCached(`${a.id}:services`, () => a.provider.listServices());
  } catch (err) {
    logger.warn({ err }, '[catalog] listServices failed');
    return [];
  }
}

async function countries(): Promise<CatalogCountry[]> {
  const a = await active();
  if (!a) return [];
  try {
    return await catalogCached(`${a.id}:countries`, () => a.provider.listCountries());
  } catch (err) {
    logger.warn({ err }, '[catalog] listCountries failed');
    return [];
  }
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
  const seen = new Set<string>();
  return tiers.filter((t) => {
    const k = `${t.rawPriceMicro}:${t.operator ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type PriceTier = Awaited<ReturnType<typeof priceTiers>>[number];

function toOfferView(serviceCode: string, countryCode: string, t: PriceTier, i: number): OfferView {
  return {
    id: buildOfferId(serviceCode, countryCode, i),
    serviceId: serviceCode,
    countryId: countryCode,
    operator: t.operator,
    priceMicro: t.priceMicro,
    stock: t.stock,
  };
}

function sumStock(tiers: PriceTier[]): number | null {
  const known = tiers.filter((t) => t.stock != null);
  return known.length ? known.reduce((n, t) => n + (t.stock ?? 0), 0) : null;
}

/** Group tiers by operator, "Any" first. */
function toOperatorViews(tiers: PriceTier[]): OperatorView[] {
  if (tiers.length === 0) return [];
  const any: OperatorView = {
    id: '',
    name: 'Any',
    count: tiers.length,
    fromPriceMicro: tiers[0]!.priceMicro,
    stock: sumStock(tiers),
  };
  const byOp = new Map<string, PriceTier[]>();
  for (const t of tiers) {
    if (!t.operator) continue;
    const list = byOp.get(t.operator) ?? [];
    list.push(t);
    byOp.set(t.operator, list);
  }
  const rest = [...byOp.entries()]
    .map(([id, list]) => ({
      id,
      name: id,
      count: list.length,
      fromPriceMicro: Math.min(...list.map((x) => x.priceMicro)),
      stock: sumStock(list),
    }))
    .sort((a, b) => a.fromPriceMicro - b.fromPriceMicro);
  return rest.length ? [any, ...rest] : [any];
}

export async function listOperators(
  serviceCode: string,
  countryCode: string,
): Promise<OperatorView[]> {
  return toOperatorViews(await priceTiers(serviceCode, countryCode));
}

export async function listOffers(
  serviceCode: string,
  countryCode: string,
  operator?: string,
): Promise<OfferView[]> {
  const tiers = await priceTiers(serviceCode, countryCode);
  return tiers
    .map((t, i) => toOfferView(serviceCode, countryCode, t, i))
    .filter((o) => !operator || o.operator === operator);
}

export async function getQuote(
  serviceCode: string,
  countryCode: string,
  operator?: string,
): Promise<QuoteResponse> {
  const tiers = await priceTiers(serviceCode, countryCode);
  const allOffers = tiers.map((t, i) => toOfferView(serviceCode, countryCode, t, i));
  const offers = operator ? allOffers.filter((o) => o.operator === operator) : allOffers;
  const bestOffer = offers.find((o) => o.stock == null || o.stock > 0) ?? offers[0] ?? null;
  return {
    serviceId: serviceCode,
    countryId: countryCode,
    available: offers.some((o) => o.stock == null || o.stock > 0),
    offers,
    operators: toOperatorViews(tiers),
    bestOffer,
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
  tierIndex?: number,
  operator?: string,
): Promise<ResolvedOrderCatalog | null> {
  const allTiers = await priceTiers(serviceCode, countryCode, settings);
  // `operator` narrows to one carrier and then takes the cheapest in-stock tier
  // (a tierIndex from an offerId indexes the full list, so it's ignored here).
  const tiers = operator ? allTiers.filter((t) => t.operator === operator) : allTiers;
  const pick =
    !operator && tierIndex != null
      ? (tiers[tierIndex] ?? null)
      : (tiers.find((t) => t.stock == null || t.stock > 0) ?? tiers[0] ?? null);
  if (!pick || (pick.stock != null && pick.stock <= 0)) return null;

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
