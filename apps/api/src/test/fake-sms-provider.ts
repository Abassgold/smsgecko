import { randomInt } from 'node:crypto';
import { renderOtpSms } from '../lib/smsTemplates.js';
import { SERVICES, COUNTRIES } from '../seed/data.js';
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
} from '../providers/sms/types.js';

/**
 * Test-only SIM-bank fixture. Registered under the `mock` adapter key by
 * `test/setup.ts` (via `registerAdapter`) and never wired into a running server
 * — production has no mock provider.
 *
 * `rent()` never schedules a delivery on its own; a test drives the OTP through
 * `simulateOtp()` (which stamps `Order.deliverAt` and calls the poll path).
 * `poll()` just compares that timestamp to now.
 */
export interface MockConfig {
  catalogPriceMicro?: number;
  catalogStock?: number;
  catalogServices?: { code: string; name: string }[];
  catalogCountries?: { code: string; name: string; iso2?: string; dialCode?: string }[];
  /** Force `rent()` to throw — exercises the fallback chain. */
  failRent?: boolean;
}

/** Stable pseudo-price per (service, country) so repeated calls don't jump around. */
function mockPriceMicro(serviceCode: string, countryCode: string): number {
  let h = 0;
  for (const ch of `${serviceCode}:${countryCode}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const usd = 0.05 + ((h % 1000) / 1000) * 0.9; // $0.05–$0.95
  return Math.round(usd * 1_000_000);
}

export class MockSmsProvider implements SmsProvider {
  readonly key = 'mock';
  constructor(
    private readonly cfg: MockConfig = {},
    readonly label: string = 'Mock SIM bank',
  ) {}

  async rent(input: RentInput): Promise<RentResult> {
    if (this.cfg.failRent) throw new Error('mock: forced rent failure');
    const digits = input.dialCode.length <= 2 ? 10 : 8;
    let national = String(randomInt(2, 10));
    for (let i = 1; i < digits; i++) national += String(randomInt(0, 10));

    return {
      providerRef: `mock_${Date.now().toString(36)}_${randomInt(0, 1e9).toString(36)}`,
      phoneNumber: `+${input.dialCode || '1'}${national}`,
      costMicro: null,
      deliverAt: null,
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

  async resend(): Promise<void> {
    // no-op — the test drives redelivery via simulateOtp()
  }

  async reactivate(providerRef: string): Promise<{ providerRef: string } | null> {
    return { providerRef };
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
