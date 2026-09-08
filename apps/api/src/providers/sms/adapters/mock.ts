import { randomInt } from 'node:crypto';
import { getSettings } from '../../../lib/settings.js';
import { renderOtpSms } from '../../../lib/smsTemplates.js';
import { SERVICES, COUNTRIES } from '../../../seed/data.js';
import type {
  CatalogCountry,
  CatalogPrice,
  CatalogQuery,
  CatalogService,
  HealthResult,
  PollContext,
  PollResult,
  RentInput,
  RentResult,
  SmsProvider,
} from '../types.js';

/**
 * Optional `ProviderConfig.config` for the mock adapter — lets tests and dev
 * pin the catalog it reports. Everything is optional; unset falls back to
 * `seed/data.ts` + a stable pseudo-price.
 */
export interface MockConfig {
  catalogPriceMicro?: number;
  catalogStock?: number;
  catalogServices?: { code: string; name: string }[];
  catalogCountries?: { code: string; name: string; iso2?: string; dialCode?: string }[];
  /** Force `rent()` to throw — used to exercise the fallback chain in tests. */
  failRent?: boolean;
}

/** Stable pseudo-price per (service, country) so repeated calls don't jump around. */
function mockPriceMicro(serviceCode: string, countryCode: string): number {
  let h = 0;
  for (const ch of `${serviceCode}:${countryCode}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const usd = 0.05 + ((h % 1000) / 1000) * 0.9; // $0.05–$0.95
  return Math.round(usd * 1_000_000);
}

/**
 * Simulated SIM bank. `rent()` decides up front (from the DB settings) whether
 * this order will ever receive an SMS and, if so, when — encoded as
 * `mockDeliverAt` which the order service stores on `Order.deliverAt`.
 * `poll()` then just compares that timestamp to now.
 */
export class MockSmsProvider implements SmsProvider {
  readonly key = 'mock';
  constructor(
    private readonly cfg: MockConfig = {},
    readonly label: string = 'Mock SIM bank',
  ) {}

  async rent(input: RentInput): Promise<RentResult> {
    if (this.cfg.failRent) throw new Error('mock: forced rent failure');
    const s = await getSettings();
    const digits = input.dialCode.length <= 2 ? 10 : 8;
    let national = String(randomInt(2, 10));
    for (let i = 1; i < digits; i++) national += String(randomInt(0, 10));

    let mockDeliverAt: Date | null = null;
    if (Math.random() < s.mockSmsSuccessRate) {
      const min = Math.min(s.mockSmsMinDelayMs, s.mockSmsMaxDelayMs);
      const max = Math.max(s.mockSmsMinDelayMs, s.mockSmsMaxDelayMs);
      mockDeliverAt = new Date(Date.now() + min + Math.floor(Math.random() * (max - min + 1)));
    }

    return {
      providerRef: `mock_${Date.now().toString(36)}_${randomInt(0, 1e9).toString(36)}`,
      phoneNumber: `+${input.dialCode || '1'}${national}`,
      costMicro: null,
      mockDeliverAt,
    };
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const { order } = ctx;
    if (!order.deliverAt || order.deliverAt.getTime() > Date.now()) {
      return { status: 'waiting' };
    }
    const sms = renderOtpSms(order.serviceSlug);
    return {
      status: 'received',
      code: sms.otp,
      messages: [{ sender: sms.sender, text: sms.text, receivedAt: new Date() }],
    };
  }

  async release(): Promise<void> {
    // no-op for the mock bank
  }

  async healthCheck(): Promise<HealthResult> {
    return { ok: true, detail: 'mock provider is always available' };
  }

  async listServices(): Promise<CatalogService[]> {
    if (this.cfg.catalogServices?.length) return this.cfg.catalogServices;
    return SERVICES.map((s) => ({ code: s.slug, name: s.name }));
  }

  async listCountries(): Promise<CatalogCountry[]> {
    if (this.cfg.catalogCountries?.length) return this.cfg.catalogCountries;
    return COUNTRIES.map((c) => ({
      code: c.code,
      name: c.name,
      iso2: c.code,
      dialCode: c.dialCode,
    }));
  }

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const source = this.cfg.catalogCountries?.length
      ? this.cfg.catalogCountries.map((c) => ({ code: c.code }))
      : COUNTRIES.map((c) => ({ code: c.code }));
    const countries = q.countryCode ? source.filter((c) => c.code === q.countryCode) : source;

    return countries.map((c) => ({
      serviceCode: q.serviceCode,
      countryCode: c.code,
      priceMicro: this.cfg.catalogPriceMicro ?? mockPriceMicro(q.serviceCode, c.code),
      stock:
        this.cfg.catalogStock ??
        (this.cfg.catalogPriceMicro != null
          ? 999
          : 25 + (mockPriceMicro(q.serviceCode, c.code) % 400)),
    }));
  }
}
