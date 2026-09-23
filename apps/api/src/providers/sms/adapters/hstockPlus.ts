import { microToUsd, usdToMicro } from '@smsgecko/shared';
import {
  NoStockError,
  ProviderConfigError,
  type HealthResult,
  type PollContext,
  type PollResult,
  type RentInput,
  type RentResult,
  type SmsProvider,
} from '../types.js';
import type {
  CatalogCountry,
  CatalogPrice,
  CatalogQuery,
  CatalogService,
} from '../types.js';
import { normalizePhone } from './activateProtocol.js';

/**
 * hstockplus.net — single-endpoint form-encoded POST API, `key` passed in the
 * body (see https://hstockplus.com/customer-api). SMS verification is its own
 * sub-API: projects are priced PER COUNTRY (the same named project has a
 * different `project_id` in every country), so — unlike smscode/smspool —
 * there's no country-agnostic service catalog to page through; `sms_projects`
 * has to be called with a `country` filter (or unfiltered, for the full
 * cross-country dump `listServices`/no-country `listPrices` use).
 *
 * projects POST action=sms_projects  [country] -> [{ project_id, name, price, country_id, country_title }]
 * countries POST action=sms_countries          -> [{ country_code, country_name }]
 * rent     POST action=add_sms  project_id, quantity=1, country
 *              -> { orders: [{ order, phone, country, status }] }
 * code     POST action=sms_status  order -> { status, phone, code, charge, currency, expires_at }
 * cancel   POST action=cancel  orders=<id>  (shared with the general marketplace order API;
 *              no SMS-specific cancel action is documented, so this is best-effort)
 * balance  POST action=balance -> { balance, currency }
 */
export interface HstockPlusConfig {
  /** Defaults to the real endpoint; override only for tests. */
  baseUrl?: string;
  apiKey?: string;
  /**
   * smsgecko service slug -> a case-insensitive substring to match against
   * HstockPlus project names for that country (e.g. "whatsapp" -> "WhatsApp").
   * Falls back to the slug itself when unset. Ambiguous matches (HstockPlus
   * often lists the same service more than once, at different prices) are
   * resolved by picking the cheapest one under `maxPriceMicro`.
   */
  serviceMap?: Record<string, string>;
  /** smsgecko ISO-2 country -> HstockPlus `country` filter value. Both are
   *  lowercase ISO-2 in practice, so this only needs entries where they differ. */
  countryMap?: Record<string, string>;
}

interface HstockPlusProject {
  project_id: string;
  name: string;
  price: string;
  country_id?: string;
  country_title?: string;
}

export class HstockPlusProvider implements SmsProvider {
  readonly key = 'hstockplus';
  private static readonly DEFAULT_BASE_URL = 'https://hstockplus.net/api/v2';

  constructor(
    private readonly cfg: HstockPlusConfig,
    readonly label: string = 'hstockplus',
  ) {}

  private async api(fields: Record<string, string | number | undefined>): Promise<Record<string, any>> {
    if (!this.cfg.apiKey) throw new ProviderConfigError('apiKey is required');
    const body = new URLSearchParams({ key: this.cfg.apiKey });
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== '') body.set(k, String(v));
    }
    const res = await fetch(this.cfg.baseUrl ?? HstockPlusProvider.DEFAULT_BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderConfigError(`${res.status} from hstockplus`);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (json?.error === 'Invalid API key') throw new ProviderConfigError('invalid hstockplus API key');
    return json;
  }

  private async projects(country?: string): Promise<HstockPlusProject[]> {
    const res = await this.api({ action: 'sms_projects', country });
    return Array.isArray(res) ? res : [];
  }

  /** Case-insensitive substring match, cheapest first. */
  private matchProjects(rows: HstockPlusProject[], namePattern: string): HstockPlusProject[] {
    const needle = namePattern.toLowerCase();
    return rows
      .filter((p) => typeof p?.name === 'string' && p.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(a.price) - Number(b.price));
  }

  async rent(input: RentInput): Promise<RentResult> {
    const country = this.cfg.countryMap?.[input.countryCode] ?? input.countryCode;
    const namePattern = this.cfg.serviceMap?.[input.serviceSlug] ?? input.serviceSlug;
    const capUsd =
      typeof input.maxPriceMicro === 'number' ? microToUsd(input.maxPriceMicro) : undefined;

    const rows = await this.projects(country);
    const matches = this.matchProjects(rows, namePattern).filter(
      (p) => capUsd === undefined || Number(p.price) <= capUsd + 1e-9,
    );
    const pick = matches[0];
    if (!pick) throw new NoStockError(`no hstockplus project matches "${namePattern}" in ${country}`);

    const res = await this.api({
      action: 'add_sms',
      project_id: pick.project_id,
      quantity: 1,
      country,
    });
    const order = res?.orders?.[0];
    if (!order?.order || !order?.phone) {
      throw new NoStockError(`hstockplus: ${res?.error ?? 'order create returned no number'}`);
    }
    // hstockplus's `phone` is just the bare national number, not a full
    // E.164 string — confirmed live 2026-09-23 (a real US order came back
    // "4055123415", not "+14055123415" as the docs example implies; same
    // "docs example doesn't match live behavior" pattern already hit once
    // with sms_countries' country_code being a dial code, not ISO-2).
    // normalizePhone() alone (strip non-digits, prepend "+") was built for
    // the SMS-Activate-family adapters, whose numbers genuinely do already
    // include the country code — reusing it here for hstockplus silently
    // produced wrong numbers for every successful rent, just never caught
    // since no real purchase had gone through it until now. input.dialCode
    // is smsgecko's own canonical dial code for the country actually
    // ordered, so no separate lookup table is needed here unlike FloZap/
    // NexuzMarket's HstockPlus wiring, which doesn't have one handy.
    const rawPhone = String(order.phone).replace(/^\+/, '');
    const dialCode = input.dialCode?.replace(/^\+/, '');
    const phoneNumber = dialCode && !rawPhone.startsWith(dialCode)
      ? `+${dialCode}${rawPhone}`
      : normalizePhone(rawPhone);
    return {
      providerRef: String(order.order),
      phoneNumber,
      costMicro: usdToMicro(Number(pick.price)),
    };
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const res = await this.api({ action: 'sms_status', order: ctx.providerRef });
    const status = String(res?.status ?? '').toLowerCase();
    const code = String(res?.code ?? '').trim();

    if (code) {
      return {
        status: 'received',
        code,
        messages: [{ sender: this.label, text: String(res?.sms_content ?? code), receivedAt: new Date() }],
      };
    }
    if (/cancel|expired|refund/.test(status)) return { status: 'canceled' };
    return { status: 'waiting' };
  }

  async release(providerRef: string): Promise<void> {
    // No dedicated SMS cancel action is documented; the general marketplace
    // `cancel` shares the same order-id space, so use it best-effort.
    await this.api({ action: 'cancel', orders: providerRef }).catch(() => undefined);
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      const res = await this.api({ action: 'balance' });
      if (res?.balance === undefined) return { ok: false, detail: res?.error ?? 'no balance in response' };
      return { ok: true, detail: `balance ${res.balance} ${res.currency ?? ''}`.trim() };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unreachable' };
    }
  }

  async listServices(): Promise<CatalogService[]> {
    // No country-agnostic project list exists; omitting `country` returns the
    // full cross-country dump, which we dedupe by name.
    const rows = await this.projects();
    const seen = new Set<string>();
    const out: CatalogService[] = [];
    for (const p of rows) {
      if (!p?.name || seen.has(p.name)) continue;
      seen.add(p.name);
      out.push({ code: p.name, name: p.name });
    }
    return out;
  }

  async listCountries(): Promise<CatalogCountry[]> {
    // Despite the published docs example (`{"country_code":"us",...}`), the live
    // endpoint's `country_code` field is actually an E.164 dial code
    // (`"+93"`), confirmed 2026-09-22. There is no field anywhere in this API
    // that returns the short country code (e.g. "us") the `country` filter on
    // sms_projects/add_sms actually needs — confirmed separately that the
    // filter accepts short codes ("us") but not full names ("united states").
    // So `code` here is display-only (dial code, sans "+"); it is NOT a valid
    // filter value. rent()/listPrices() never read it — they pass smsgecko's
    // own canonical ISO-2 countryCode straight through by default, which is
    // what actually works against this provider.
    const res = await this.api({ action: 'sms_countries' });
    const rows: any[] = Array.isArray(res) ? res : [];
    return rows
      .map((c) => ({
        code: String(c.country_code ?? '').replace(/^\+/, ''),
        name: String(c.country_name ?? c.country_code ?? ''),
        dialCode: String(c.country_code ?? '').replace(/^\+/, '') || undefined,
      }))
      .filter((c) => c.code && c.name);
  }

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const namePattern = this.cfg.serviceMap?.[q.serviceCode] ?? q.serviceCode;

    if (q.countryCode) {
      const country = this.cfg.countryMap?.[q.countryCode] ?? q.countryCode;
      const rows = await this.projects(country);
      return this.matchProjects(rows, namePattern).map((p) => ({
        serviceCode: p.name,
        countryCode: q.countryCode!,
        priceMicro: usdToMicro(Number(p.price)),
        stock: null,
      }));
    }

    // No country given: one unfiltered call, priced per (already-embedded) country.
    // country_title comes back as a lowercase full name (e.g. "united states"),
    // not ISO-2, so resolve it back through the countries list.
    const [rows, countries] = await Promise.all([this.projects(), this.listCountries()]);
    const nameToCode = new Map(countries.map((c) => [c.name.toLowerCase(), c.code]));
    const out: CatalogPrice[] = [];
    for (const p of this.matchProjects(rows, namePattern)) {
      const countryCode = nameToCode.get(String(p.country_title ?? '').toLowerCase());
      if (!countryCode) continue;
      out.push({
        serviceCode: p.name,
        countryCode,
        priceMicro: usdToMicro(Number(p.price)),
        stock: null,
      });
    }
    return out;
  }
}
