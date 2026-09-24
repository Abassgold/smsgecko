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
const PRODUCT_PAGE_SIZE = 1000;
/** Slack over the product price sent as max_price (see rent()). */
const MAX_PRICE_HEADROOM = 1.02;
/** Hard stop so a misbehaving pager can't loop forever. */
const PRODUCT_MAX_PAGES = 20;

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
    // `orders/create` keys off `catalog_product_id` (the reusable slot), NOT the
    // concrete product `id`; passing the latter yields NO_OFFER_AVAILABLE.
    const affordable = products
      .filter((p) => p?.active !== false && Number(p?.available ?? 1) > 0)
      .map((p) => ({
        slotId: p?.catalog_product_id,
        amount: Number(p?.price?.amount ?? p?.price ?? NaN),
      }))
      .filter(
        (p) =>
          p.slotId != null &&
          Number.isFinite(p.amount) &&
          (capUsd === undefined || p.amount <= capUsd + 1e-9),
      )
      .sort((a, b) => a.amount - b.amount);

    const pick = affordable[0];
    if (!pick) throw new NoStockError('no affordable smscode product for this service/country');

    const created = await this.api('orders/create', {
      method: 'POST',
      body: JSON.stringify({
        catalog_product_id: pick.slotId,
        // smscode converts max_price to IDR and rounds it, so the exact USD
        // price can land 1 IDR under the product's own IDR price and match no
        // offer (NO_OFFER_AVAILABLE, candidates_considered: 0). Give it a small
        // headroom; the order is still billed at the product's price.
        max_price: (pick.amount * MAX_PRICE_HEADROOM + 0.0001).toFixed(4),
        quantity: 1,
      }),
    });
    if (!created?.success) {
      const err = created?.error ?? {};
      throw new NoStockError(
        `smscode: ${err.message ?? err.code ?? 'order create failed'}`.slice(0, 160),
      );
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
        messages: [{ sender: '', text: String(row.otp_message ?? code), receivedAt: new Date() }],
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

  async resend(providerRef: string): Promise<void> {
    await this.api('orders/resend', {
      method: 'POST',
      body: JSON.stringify({ id: Number(providerRef) }),
    }).catch(() => undefined);
  }

  async reactivate(providerRef: string): Promise<{ providerRef: string } | null> {
    const res = await this.api('orders/reactivate', {
      method: 'POST',
      body: JSON.stringify({ id: Number(providerRef) }),
    }).catch(() => null);
    if (!res || res.success === false) return null;
    // Reactivation keeps the same order id / number on smscode.
    const id = res?.data?.orders?.[0]?.id ?? res?.data?.id ?? providerRef;
    return { providerRef: String(id) };
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      await this.api('orders/active');
      return { ok: true, detail: 'authenticated' };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unreachable' };
    }
  }

  /**
   * Every product matching `params`. /catalog/products is paged (`page`,
   * `limit`) and a popular platform alone runs to thousands of rows, so a
   * single page silently truncated the price list.
   */
  private async allProducts(params: URLSearchParams): Promise<any[]> {
    const out: any[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= PRODUCT_MAX_PAGES; page++) {
      params.set('limit', String(PRODUCT_PAGE_SIZE));
      params.set('page', String(page));
      const j = await this.api(`catalog/products?${params.toString()}`);
      const rows: any[] = Array.isArray(j?.data) ? j.data : [];
      let fresh = 0;
      for (const r of rows) {
        const id = String(r?.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(r);
        fresh++;
      }
      if (rows.length < PRODUCT_PAGE_SIZE || fresh === 0) break;
    }
    return out;
  }

  async listServices(): Promise<CatalogService[]> {
    // /catalog/services -> { data: [{ id, code, name, active }] }; `id` is the
    // `platform_id` products and orders key off.
    const j = await this.api('catalog/services').catch(() => null);
    const rows: any[] = Array.isArray(j?.data) ? j.data : [];
    return rows
      .filter((p) => p?.active !== false)
      .map((p) => ({ code: String(p.id ?? ''), name: String(p.name ?? p.code ?? '').trim() }))
      .filter((s) => s.code && s.name);
  }

  async listCountries(): Promise<CatalogCountry[]> {
    // /catalog/countries -> { data: [{ id, code: "ID", name, dial_code: "+62", active }] }
    const j = await this.api('catalog/countries').catch(() => null);
    const rows: any[] = Array.isArray(j?.data) ? j.data : [];
    return rows
      .filter((c) => c?.active !== false)
      .map((c) => {
        const dial = c.dial_code ?? c.phone_code;
        return {
          code: String(c.id ?? ''),
          name: String(c.name ?? c.id ?? '').trim(),
          iso2:
            typeof c.code === 'string' && /^[a-z]{2}$/i.test(c.code) ? c.code.toLowerCase() : undefined,
          dialCode: dial ? String(dial).replace(/[^\d]/g, '') || undefined : undefined,
        };
      })
      .filter((c) => c.code && c.name);
  }

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const platformId = this.cfg.serviceMap?.[q.serviceCode] ?? q.serviceCode;
    const params = new URLSearchParams({ platform_id: platformId });
    if (q.countryCode) {
      params.set('country_id', this.cfg.countryMap?.[q.countryCode] ?? q.countryCode);
    }
    const rows = await this.allProducts(params);
    return rows
      .filter((p) => p?.active !== false)
      .map((p) => ({
        serviceCode: q.serviceCode,
        countryCode: String(p.country_id ?? q.countryCode ?? ''),
        priceMicro: Math.round(Number(p?.price?.amount ?? p?.price ?? 0) * 1_000_000) || 0,
        stock: p.available != null ? Number(p.available) : null,
        operator: p.operator_name ?? (p.operator_id != null ? String(p.operator_id) : null),
      }))
      .filter((r) => r.countryCode && r.priceMicro > 0);
  }
}
