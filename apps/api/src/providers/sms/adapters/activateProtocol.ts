import { microToUsd } from '@smsgecko/shared';
import {
  NoStockError,
  ProviderConfigError,
  type CatalogCountry,
  type CatalogPrice,
  type CatalogService,
  type PollResult,
  type RentInput,
} from '../types.js';

export interface ActivateConfig {
  baseUrl?: string;
  apiKey?: string;
  serviceMap?: Record<string, string>;
  countryMap?: Record<string, string>;
}

const NO_STOCK = [
  'NO_NUMBERS',
  'NO_NUMBER',
  'NO_BALANCE',
  'NO_FREE_PHONES',
  'NO_ACTIVATIONS',
  'NO_ACTIVATION',
  'TOO_MANY_ACTIVE_RENTALS',
  'BAD_SERVICE',
  'BAD_COUNTRY',
];
const PRICE_ERRORS = ['WRONG_MAX_PRICE', 'MAX_PRICE', 'WRONG_MAXPRICE'];
const AUTH_ERRORS = ['BAD_KEY', 'ERROR_SQL', 'BANNED', 'BAD_ACTION', 'ERROR_NO_KEY'];

export async function activateGet(
  cfg: ActivateConfig,
  params: Record<string, string | number | undefined>,
): Promise<string> {
  if (!cfg.baseUrl || !cfg.apiKey) {
    throw new ProviderConfigError('baseUrl and apiKey are required');
  }
  const url = new URL(cfg.baseUrl);
  url.searchParams.set('api_key', cfg.apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { accept: 'text/plain, application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const text = (await res.text()).trim();

  if (res.status === 401 || res.status === 403) {
    throw new ProviderConfigError(`${res.status} from provider`);
  }
  const up = text.toUpperCase();
  if (AUTH_ERRORS.some((e) => up === e || up.startsWith(`${e}:`) || up.startsWith(`${e} `))) {
    throw new ProviderConfigError(text.slice(0, 120));
  }
  return text;
}

export function mapService(cfg: ActivateConfig, slug: string): string {
  return cfg.serviceMap?.[slug] ?? cfg.serviceMap?.[slug.toLowerCase()] ?? slug;
}

export function mapCountry(cfg: ActivateConfig, iso2: string): string {
  return cfg.countryMap?.[iso2] ?? cfg.countryMap?.[iso2.toLowerCase()] ?? iso2;
}

/** Micro-USD cap -> a plain USD number the text APIs expect, or undefined. */
export function priceCapUsd(input: RentInput): number | undefined {
  if (typeof input.maxPriceMicro !== 'number') return undefined;
  return Number(microToUsd(input.maxPriceMicro).toFixed(4));
}

/** Parse an `ACCESS_NUMBER:<id>:<phone>` line; throw NoStockError otherwise. */
export function parseRentResponse(text: string): { providerRef: string; phoneNumber: string } {
  const up = text.toUpperCase();
  if (up.startsWith('ACCESS_NUMBER')) {
    const parts = text.split(':');
    const id = parts[1]?.trim();
    const phone = parts[2]?.trim();
    if (id && phone) return { providerRef: id, phoneNumber: normalizePhone(phone) };
  }
  if (PRICE_ERRORS.some((e) => up.startsWith(e))) {
    throw new NoStockError(`price cap too low (${text.slice(0, 60)})`);
  }
  if (NO_STOCK.some((e) => up === e || up.startsWith(`${e}:`))) {
    throw new NoStockError(text.slice(0, 60));
  }
  throw new NoStockError(`unexpected rent response: ${text.slice(0, 80)}`);
}

/** Parse a `getStatus` response into a PollResult. */
export function parseStatusResponse(text: string, sender = 'SMS'): PollResult {
  const up = text.toUpperCase();
  if (up.startsWith('STATUS_OK')) {
    const code = text.slice(text.indexOf(':') + 1).trim();
    return {
      status: 'received',
      code: code || null,
      messages: code ? [{ sender, text: code, receivedAt: new Date() }] : [],
    };
  }
  if (up.startsWith('STATUS_CANCEL') || up === 'NO_ACTIVATION') {
    return { status: 'canceled' };
  }
  // STATUS_WAIT_CODE, STATUS_WAIT_RETRY, STATUS_WAIT_RESEND, …
  return { status: 'waiting' };
}

export function normalizePhone(raw: string): string {
  const digits = String(raw).replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
}

/* ---------------- catalog (SMS-Activate family) ---------------- */

/** Like activateGet but requires a JSON body. */
export async function activateJson(
  cfg: ActivateConfig,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const text = await activateGet(cfg, params);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderConfigError(`non-JSON from provider: ${text.slice(0, 80)}`);
  }
}

/** Parse `getServicesList` → `{ status, services: [{ code, name }] }` (or a bare array). */
export function parseActivateServices(json: unknown): CatalogService[] {
  const j = json as { services?: unknown };
  const arr = Array.isArray(j?.services) ? j.services : Array.isArray(json) ? json : [];
  return (arr as Record<string, unknown>[])
    .map((s) => ({
      code: String(s.code ?? s.id ?? '').trim(),
      name: String(s.name ?? s.title ?? s.code ?? '').trim(),
    }))
    .filter((s) => s.code && s.name);
}

/** Parse `getCountries` → `{ "<id>": { id, eng, iso? } }` (or a bare array). */
export function parseActivateCountries(json: unknown): CatalogCountry[] {
  const entries: [string, Record<string, unknown>][] = Array.isArray(json)
    ? (json as Record<string, unknown>[]).map((v, i) => [String(v.id ?? i), v])
    : json && typeof json === 'object'
      ? (Object.entries(json as Record<string, Record<string, unknown>>))
      : [];
  return entries
    .map(([k, v]) => ({
      code: String(v?.id ?? k),
      name: String(v?.eng ?? v?.name ?? v?.rus ?? k).trim(),
      iso2: typeof v?.iso === 'string' ? (v.iso as string).toLowerCase() : undefined,
    }))
    .filter((c) => c.code && c.name && c.name !== c.code);
}

/**
 * Parse `getPrices` into flat rows. Handles both shapes seen in the wild:
 *   A: { "<countryId>": { "<service>": { cost, count } } }
 *   B: { "<service>": { cost, count } }         (daisySMS, US-only)
 */
export function parseActivatePrices(json: unknown): CatalogPrice[] {
  const out: CatalogPrice[] = [];
  if (!json || typeof json !== 'object') return out;

  for (const [outerKey, inner] of Object.entries(json as Record<string, unknown>)) {
    if (!inner || typeof inner !== 'object') continue;
    const innerObj = inner as Record<string, unknown>;

    if ('cost' in innerObj || 'count' in innerObj) {
      // Shape B — outerKey is the service, country is implicit (US).
      out.push({
        serviceCode: outerKey,
        countryCode: '0',
        priceMicro: Math.round(Number(innerObj.cost) * 1_000_000) || 0,
        stock: innerObj.count != null ? Number(innerObj.count) : null,
      });
      continue;
    }

    // Shape A — outerKey is a country id, keys under it are services.
    for (const [svc, info] of Object.entries(innerObj)) {
      if (!info || typeof info !== 'object') continue;
      const i = info as Record<string, unknown>;
      out.push({
        serviceCode: svc,
        countryCode: outerKey,
        priceMicro: Math.round(Number(i.cost) * 1_000_000) || 0,
        stock: i.count != null ? Number(i.count) : null,
      });
    }
  }
  return out;
}
