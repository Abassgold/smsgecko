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
 * smspool.net — form-encoded POST API, key passed in the body. Numeric status
 * codes on /sms/check: 1 pending, 3 received, 6 refunded/expired.
 * (FloZap: SMS_POOL / SERVER2 — `rentSMSPoolNumber`, `pollSMSPool`,
 * `cancelSmsPoolRental`; base `api.smspool.net`.)
 *
 * rent   POST /purchase/sms  key,country,service,pricing_option[,max_price]
 *            -> { success: 1, order_id, number, cost }
 * poll   POST /sms/check     key,orderid   -> { status, sms, full_sms }
 * cancel POST /sms/cancel    key,orderid
 */
export interface SmsPoolConfig {
  /** e.g. "https://api.smspool.net". */
  baseUrl?: string;
  apiKey?: string;
  /** smsgecko service slug -> smspool service id. */
  serviceMap?: Record<string, string>;
  /** smsgecko ISO-2 country -> smspool country id. */
  countryMap?: Record<string, string>;
  /** 0 = cheapest available pool (default). */
  pricingOption?: number;
}

export class SmsPoolProvider implements SmsProvider {
  readonly key = 'sms_pool';
  constructor(
    private readonly cfg: SmsPoolConfig,
    readonly label: string = 'smspool',
  ) {}

  private async form(
    path: string,
    fields: Record<string, string | number | undefined>,
  ): Promise<any> {
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      throw new ProviderConfigError('baseUrl and apiKey are required');
    }
    const body = new URLSearchParams({ key: this.cfg.apiKey });
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== '') body.set(k, String(v));
    }
    const res = await fetch(new URL(path, this.cfg.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new ProviderConfigError(`${res.status} from smspool`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async rent(input: RentInput): Promise<RentResult> {
    const capUsd =
      typeof input.maxPriceMicro === 'number' ? microToUsd(input.maxPriceMicro) : undefined;
    const res = await this.form('/purchase/sms', {
      country: this.cfg.countryMap?.[input.countryCode] ?? input.countryCode,
      service: this.cfg.serviceMap?.[input.serviceSlug] ?? input.serviceSlug,
      pricing_option: this.cfg.pricingOption ?? 0,
      max_price: capUsd !== undefined ? capUsd.toFixed(4) : undefined,
      quantity: 1,
    });

    if (res && typeof res === 'object' && Number(res.success) === 1 && (res.number ?? res.phonenumber)) {
      return {
        providerRef: String(res.order_id ?? res.orderid),
        phoneNumber: normalizePhone(String(res.number ?? res.phonenumber)),
        costMicro: res.cost != null ? usdToMicro(Number(res.cost)) : null,
      };
    }
    const msg =
      (res && typeof res === 'object' && (res.message || res.error)) || String(res).slice(0, 80);
    throw new NoStockError(`smspool: ${msg}`);
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const res = await this.form('/sms/check', { orderid: ctx.providerRef });
    const status = Number(res?.status);
    if (status === 3) {
      const code = String(res.sms ?? res.code ?? '').trim();
      return {
        status: 'received',
        code: code || null,
        messages: [
          { sender: '', text: String(res.full_sms ?? res.sms ?? code), receivedAt: new Date() },
        ],
      };
    }
    if (status === 5 || status === 6) return { status: 'canceled' };
    return { status: 'waiting' };
  }

  async release(providerRef: string): Promise<void> {
    await this.form('/sms/cancel', { orderid: providerRef }).catch(() => undefined);
  }

  async finish(providerRef: string): Promise<void> {
    // smspool auto-finalises once a code is delivered; there's no finish endpoint.
    // FloZap's markSMSPoolRentalAsDone just re-checks status — mirror that.
    await this.form('/sms/check', { orderid: providerRef }).catch(() => undefined);
  }

  async resend(providerRef: string): Promise<void> {
    await this.form('/sms/resend', { orderid: providerRef }).catch(() => undefined);
  }

  async reactivate(providerRef: string): Promise<{ providerRef: string } | null> {
    const res = await this.form('/sms/reactivate', { orderid: providerRef }).catch(() => null);
    if (res && typeof res === 'object' && Number(res.success) === 1) {
      return { providerRef: String(res.order_id ?? res.orderid ?? providerRef) };
    }
    return null;
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      const res = await this.form('/request/balance', {});
      const balance = res && typeof res === 'object' ? res.balance : res;
      return { ok: balance !== undefined, detail: `balance ${balance}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unreachable' };
    }
  }

  async listServices(): Promise<CatalogService[]> {
    const j = await this.form('/service/retrieve_all', {});
    const rows: any[] = Array.isArray(j) ? j : [];
    return rows
      .map((s) => ({ code: String(s.ID ?? s.id ?? ''), name: String(s.name ?? s.ID ?? '') }))
      .filter((s) => s.code && s.name);
  }

  async listCountries(): Promise<CatalogCountry[]> {
    const j = await this.form('/country/retrieve_all', {});
    const rows: any[] = Array.isArray(j) ? j : [];
    return rows
      .map((c) => {
        // short_name is ISO-2, except virtual pools: "US_V", "AU_V" -> "us", "au".
        const iso = typeof c.short_name === 'string' ? /^[a-z]{2}/i.exec(c.short_name)?.[0] : undefined;
        const dial = c.cc != null ? String(c.cc).replace(/[^\d]/g, '') : '';
        return {
          code: String(c.ID ?? c.id ?? ''),
          name: String(c.name ?? c.ID ?? ''),
          iso2: iso?.toLowerCase(),
          dialCode: dial || undefined,
        };
      })
      .filter((c) => c.code && c.name);
  }

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const service = this.cfg.serviceMap?.[q.serviceCode] ?? q.serviceCode;
    const country = q.countryCode ? (this.cfg.countryMap?.[q.countryCode] ?? q.countryCode) : undefined;

    // /request/success_rate returns a row per country with both tiers AND stock,
    // so it serves the single-country case too (/request/price carries no stock).
    const arr = await this.form('/request/success_rate', { service });
    const rows: any[] = Array.isArray(arr) ? arr : [];
    const out: CatalogPrice[] = [];
    for (const c of rows) {
      const cc = String(c.country_id ?? c.ID ?? '');
      if (!cc || (country && cc !== country)) continue;
      const stock = c.stock != null ? Number(c.stock) : null;
      const low = Number(c.low_price);
      const hi = Number(c.price);
      if (Number.isFinite(low) && low > 0) {
        out.push({ serviceCode: q.serviceCode, countryCode: cc, priceMicro: Math.round(low * 1_000_000), stock });
      }
      if (Number.isFinite(hi) && hi > 0 && hi !== low) {
        out.push({ serviceCode: q.serviceCode, countryCode: cc, priceMicro: Math.round(hi * 1_000_000), stock });
      }
    }
    if (out.length || !country) return out;

    // Country missing from success_rate: fall back to /request/price (no stock).
    const r = await this.form('/request/price', { service, country });
    for (const key of ['price', 'high_price'] as const) {
      const micro = Math.round(Number(r?.[key]) * 1_000_000);
      if (micro > 0 && !out.some((o) => o.priceMicro === micro)) {
        out.push({ serviceCode: q.serviceCode, countryCode: country, priceMicro: micro, stock: null });
      }
    }
    return out;
  }
}
