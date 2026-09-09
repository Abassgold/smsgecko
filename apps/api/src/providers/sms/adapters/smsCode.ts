import { microToUsd, usdToMicro } from '@smsgecko/shared';
import { parseOtp } from '../../../lib/smsTemplates.js';
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
 * smscode.gg — REST + `Authorization: Bearer` API. Unlike the SMS-Activate
 * clones it works off "catalog products", so rent() first looks one up by
 * platform + country, picks the cheapest under our price cap, then creates the
 * order. (FloZap: SMSCODE / `create_sms_code_activation`, `get_sms_code_prices`,
 * `pollSmsCodeJob`, `cancel_sms_code_order`; base `api.smscode.gg/v2`.)
 *
 * products GET  /catalog/products?country_id=&platform_id=
 *              -> { data: [{ id, price: { amount } }] }
 * rent     POST /orders/create  { catalog_product_id, max_price, quantity: 1 }
 *              -> { success, data: { orders: [{ id, phone_number }] } }
 * poll     GET  /orders/active  -> { data: [{ id, otp_code, otp_message, status }] }
 * cancel   POST /orders/cancel  { id }
 */
export interface SmsCodeConfig {
  /** e.g. "https://api.smscode.gg/v2". */
  baseUrl?: string;
  apiKey?: string;
  /** smsgecko service slug -> smscode platform_id. */
  serviceMap?: Record<string, string>;
  /** smsgecko ISO-2 country -> smscode country_id. */
  countryMap?: Record<string, string>;
}

export class SmsCodeProvider implements SmsProvider {
  readonly key = 'sms_code';
  constructor(
    private readonly cfg: SmsCodeConfig,
    readonly label: string = 'smscode',
  ) {}

  private base(): string {
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      throw new ProviderConfigError('baseUrl and apiKey are required');
    }
    return this.cfg.baseUrl.endsWith('/') ? this.cfg.baseUrl : `${this.cfg.baseUrl}/`;
  }

  private async api(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(new URL(path, this.base()), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderConfigError(`${res.status} from smscode`);
    }
    return res.json().catch(() => ({}));
  }

  async rent(input: RentInput): Promise<RentResult> {
    const platformId = this.cfg.serviceMap?.[input.serviceSlug] ?? input.serviceSlug;
    const countryId = this.cfg.countryMap?.[input.countryCode] ?? input.countryCode;
    const capUsd =
      typeof input.maxPriceMicro === 'number' ? microToUsd(input.maxPriceMicro) : undefined;

    const list = await this.api(
      `catalog/products?country_id=${encodeURIComponent(countryId)}&platform_id=${encodeURIComponent(platformId)}`,
    );
    const products: any[] = Array.isArray(list?.data) ? list.data : [];
    const affordable = products
      .map((p) => ({ id: p?.id, amount: Number(p?.price?.amount ?? p?.price ?? NaN) }))
      .filter(
        (p) => p.id != null && Number.isFinite(p.amount) && (capUsd === undefined || p.amount <= capUsd),
      )
      .sort((a, b) => a.amount - b.amount);

    const pick = affordable[0];
    if (!pick) throw new NoStockError('no affordable smscode product for this service/country');

    const created = await this.api('orders/create', {
      method: 'POST',
      body: JSON.stringify({ catalog_product_id: pick.id, max_price: pick.amount, quantity: 1 }),
    });
    if (!created?.success) {
      throw new NoStockError(`smscode: ${created?.error?.message ?? created?.error?.code ?? 'order create failed'}`);
    }
    const order = created.data?.orders?.[0];
    if (!order?.id || !order?.phone_number) {
      throw new NoStockError('smscode: order create returned no number');
    }
    return {
      providerRef: String(order.id),
      phoneNumber: normalizePhone(String(order.phone_number)),
      costMicro: usdToMicro(pick.amount),
    };
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const active = await this.api('orders/active');
    const rows: any[] = Array.isArray(active?.data) ? active.data : [];
    const row = rows.find((o) => String(o?.id) === String(ctx.providerRef));

    // Dropped from the active list: treat as still waiting and let smsgecko's
    // own expiry timer refund if nothing ever arrives.
    if (!row) return { status: 'waiting' };

    const code = String(row.otp_code ?? '').trim() || parseOtp(String(row.otp_message ?? '')) || '';
    if (code) {
      return {
        status: 'received',
        code,
        messages: [{ sender: this.label, text: String(row.otp_message ?? code), receivedAt: new Date() }],
      };
    }
    if (String(row.status ?? '').toUpperCase() === 'CANCELED') return { status: 'canceled' };
    return { status: 'waiting' };
  }

  async release(providerRef: string): Promise<void> {
    await this.api('orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ id: Number(providerRef) }),
    }).catch(() => undefined);
  }

  async finish(providerRef: string): Promise<void> {
    // FloZap: mark_sms_code_as_done -> POST /orders/finish { id }
    await this.api('orders/finish', {
      method: 'POST',
      body: JSON.stringify({ id: Number(providerRef) }),
    }).catch(() => undefined);
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      await this.api('orders/active');
      return { ok: true, detail: 'authenticated' };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unreachable' };
    }
  }

  async listServices(): Promise<CatalogService[]> {
    const j = await this.api('catalog/platforms').catch(() => null);
    const rows: any[] = Array.isArray(j?.data) ? j.data : [];
    if (rows.length) {
      return rows
        .map((p) => ({ code: String(p.id ?? p.slug ?? p.code ?? ''), name: String(p.name ?? p.title ?? p.id ?? '') }))
        .filter((s) => s.code && s.name);
    }
    // Fallback: distinct platforms seen in the product catalog.
    const prod = await this.api('catalog/products?limit=1000').catch(() => null);
    const pr: any[] = Array.isArray(prod?.data) ? prod.data : [];
    const seen = new Map<string, string>();
    for (const p of pr) {
      const code = String(p.platform_id ?? p.platform?.id ?? '');
      if (code && !seen.has(code)) seen.set(code, String(p.platform?.name ?? p.platform_name ?? code));
    }
    return [...seen].map(([code, name]) => ({ code, name }));
  }

  async listCountries(): Promise<CatalogCountry[]> {
    const j = await this.api('catalog/countries').catch(() => null);
    const rows: any[] = Array.isArray(j?.data) ? j.data : [];
    return rows
      .map((c) => ({
        code: String(c.id ?? c.code ?? ''),
        name: String(c.name ?? c.title ?? c.id ?? ''),
        iso2:
          typeof c.iso === 'string'
            ? c.iso.toLowerCase()
            : typeof c.code === 'string' && c.code.length === 2
              ? c.code.toLowerCase()
              : undefined,
        dialCode: c.phone_code ? String(c.phone_code).replace(/^\+/, '') : undefined,
      }))
      .filter((c) => c.code && c.name);
  }

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const platformId = this.cfg.serviceMap?.[q.serviceCode] ?? q.serviceCode;
    const params = new URLSearchParams({ platform_id: platformId, limit: '1000' });
    if (q.countryCode) {
      params.set('country_id', this.cfg.countryMap?.[q.countryCode] ?? q.countryCode);
    }
    const j = await this.api(`catalog/products?${params.toString()}`);
    const rows: any[] = Array.isArray(j?.data) ? j.data : [];
    return rows
      .map((p) => ({
        serviceCode: String(p.platform_id ?? platformId),
        countryCode: String(p.country_id ?? q.countryCode ?? ''),
        priceMicro: Math.round(Number(p?.price?.amount ?? p?.price ?? 0) * 1_000_000) || 0,
        stock: p.stock != null ? Number(p.stock) : p.count != null ? Number(p.count) : null,
        operator: p.operator ?? null,
      }))
      .filter((r) => r.countryCode && r.priceMicro > 0);
  }
}
