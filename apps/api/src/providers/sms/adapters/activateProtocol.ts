import { microToUsd } from '@smsgecko/shared';
import { dialCodeFor, lookupCountry } from '../../../lib/countryLookup.js';
import {
  NoStockError,
  ProviderConfigError,
  ProviderUnavailableError,
  type CatalogCountry,
  type CatalogPrice,
  type CatalogService,
  type PollResult,
  type ReleaseResult,
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

  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      headers: { accept: 'text/plain, application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    text = (await res.text()).trim(); // the timeout also covers reading the body
  } catch (err) {
    throw new ProviderUnavailableError(`provider unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderConfigError(`${res.status} from provider`);
  }
  if (res.status === 429 || res.status >= 500) {
    throw new ProviderUnavailableError(`provider answered ${res.status}`);
  }
  const up = text.toUpperCase();
  if (AUTH_ERRORS.some((e) => up === e || up.startsWith(`${e}:`) || up.startsWith(`${e} `))) {
    throw new ProviderConfigError(text.slice(0, 120));
  }
  return text;
}

/**
 * `setStatus` (status 3) replies `ACCESS_RETRY_GET` when it worked. A refusal is a plain code such as NO_ACTIVATION or BAD_STATUS:
 * throw on those, so a refused resend is never reported as done. A reply we don't recognise is let through (never block a resend that
 * may have worked); the caller logs it.
 */
export function assertResendAccepted(text: string): void {
  const up = text.trim().toUpperCase();
  if (/^(NO_|BAD_|WRONG_|ERROR|BANNED|EARLY_)/.test(up)) {
    throw new Error(`provider refused the resend: ${text.trim().slice(0, 60)}`);
  }
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
  // NO_BALANCE (our provider account is empty) and anything unrecognised: not a stock problem, never "no numbers".
  throw new ProviderUnavailableError(`unexpected rent response: ${text.slice(0, 80)}`);
}

/**
 * Some resellers answer a refused cancel with JSON instead of the plain token, e.g. hero-sms:
 * `{"title":"EARLY_CANCEL_DENIED","details":"Activation …"}` (seen live). Use its `title` as the token.
 */
function releaseToken(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('{')) return t;
  try {
    const j = JSON.parse(t) as { title?: unknown; status?: unknown; message?: unknown };
    const token = [j.title, j.status, j.message].find((v) => typeof v === 'string' && v.trim());
    return typeof token === 'string' ? token.trim() : t;
  } catch {
    return t;
  }
}

/**
 * What an SMS-Activate-style `setStatus status=8` (cancel) answered. Anything not recognised throws, so the caller
 * does not refund on a guess.
 */
export function parseReleaseResponse(raw: string): ReleaseResult {
  const text = releaseToken(raw);
  const up = text.trim().toUpperCase();
  if (up.startsWith('ACCESS_CANCEL') || up.startsWith('STATUS_CANCEL')) return { status: 'canceled' };
  if (up.startsWith('EARLY_CANCEL_DENIED')) return { status: 'too_early' };
  if (up.startsWith('STATUS_OK') || up.startsWith('SMS_RECEIVED')) {
    const code = text.includes(':') ? text.slice(text.indexOf(':') + 1).trim() : '';
    return { status: 'received', code: code || null };
  }
  // Already gone upstream: nothing left to cancel.
  if (up === 'NO_ACTIVATION') return { status: 'canceled' };
  throw new ProviderUnavailableError(`unexpected cancel response: ${text.trim().slice(0, 60)}`);
}

/** Parse a `getStatus` response into a PollResult. */
export function parseStatusResponse(text: string, sender = ''): PollResult {
  const up = text.toUpperCase();
  // STATUS_WAIT_RETRY:<code> = a code has arrived and the provider awaits our retry/finish decision. After our own
  // "another SMS" it keeps answering with the PREVIOUS code until the new one lands: the caller skips codes it has
  // already delivered (Order.otpHistory).
  if (up.startsWith('STATUS_OK') || up.startsWith('STATUS_WAIT_RETRY')) {
    const code = text.slice(text.indexOf(':') + 1).trim();
    if (!code) return { status: 'waiting' };
    return { status: 'received', code, messages: [{ sender, text: code, receivedAt: new Date() }] };
  }
  if (up.startsWith('STATUS_CANCEL') || up.startsWith('ACCESS_CANCEL')) {
    return { status: 'canceled' };
  }
  // STATUS_WAIT_CODE, STATUS_WAIT_RESEND, … and NO_ACTIVATION. NO_ACTIVATION is never treated as a cancel: it can be
  // a transient lookup miss, and a refund here would pay back money the provider may still hold (the expiry
  // worker closes the order at its TTL either way).
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
    .map(([k, v]) => {
      const name = String(v?.eng ?? v?.name ?? v?.rus ?? k).trim();
      // Most clones send only names — derive the ISO-2 / dial code from the English one.
      const found = lookupCountry(name);
      const iso2 = typeof v?.iso === 'string' ? (v.iso as string).toLowerCase() : found.iso2;
      return {
        code: String(v?.id ?? k),
        name,
        iso2,
        dialCode: iso2 === found.iso2 ? found.dialCode : dialCodeFor(iso2),
      };
    })
    .filter((c) => c.code && c.name && c.name !== c.code);
}

/**
 * Parse `getPrices` into flat rows. Handles both shapes seen in the wild:
 *   A: { "<countryId>": { "<service>": { cost, count } } }
 *   B: { "<service>": { cost, count } }         (single-country resellers)
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
