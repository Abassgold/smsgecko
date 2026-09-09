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
import { ProviderConfigError } from '../types.js';
import {
  activateGet,
  activateJson,
  mapCountry,
  mapService,
  parseActivateCountries,
  parseActivatePrices,
  parseActivateServices,
  parseRentResponse,
  parseStatusResponse,
  priceCapUsd,
  type ActivateConfig,
} from './activateProtocol.js';

/**
 * hero-sms.com — SMS-Activate-style text API.
 * (FloZap: SERVER1 / `rentServer1Number`, base `hero-sms.com/stubs/handler_api.php`.)
 *
 * rent   GET ?action=getNumber&service=&country=&fixedPrice=&freePrice=true
 *        -> "ACCESS_NUMBER:<id>:<phone>"
 * poll   GET ?action=getStatus&id=<id>   -> "STATUS_OK:<code>" | "STATUS_WAIT_CODE" | …
 * cancel GET ?action=setStatus&id=<id>&status=8
 * prices GET /api/v1/activations/offers?services=&countries=  (Authorization: ApiKey)
 *        -> data.data[svc][ctry].map = { "<price>": <cumulative stock>, … }
 *        one tier per price point (FloZap: server1getPrice).
 */
export type HeroSmsConfig = ActivateConfig;

export class HeroSmsProvider implements SmsProvider {
  readonly key = 'hero_sms';
  constructor(
    private readonly cfg: HeroSmsConfig,
    readonly label: string = 'hero-sms',
  ) {}

  async rent(input: RentInput): Promise<RentResult> {
    const cap = priceCapUsd(input);
    const text = await activateGet(this.cfg, {
      action: 'getNumber',
      service: mapService(this.cfg, input.serviceSlug),
      country: mapCountry(this.cfg, input.countryCode),
      fixedPrice: cap,
      freePrice: cap !== undefined ? 'true' : undefined,
    });
    const { providerRef, phoneNumber } = parseRentResponse(text);
    return { providerRef, phoneNumber, costMicro: null };
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const text = await activateGet(this.cfg, { action: 'getStatus', id: ctx.providerRef });
    return parseStatusResponse(text, this.label);
  }

  async release(providerRef: string): Promise<void> {
    // status 8 = cancel activation
    await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 8 }).catch(
      () => undefined,
    );
  }

  async finish(providerRef: string): Promise<void> {
    // status 6 = complete activation (FloZap: markServerRentalAsDone)
    await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 6 }).catch(
      () => undefined,
    );
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      const text = await activateGet(this.cfg, { action: 'getBalance' });
      const ok = text.toUpperCase().startsWith('ACCESS_BALANCE');
      return { ok, detail: text.slice(0, 80) };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unreachable' };
    }
  }

  async listServices(): Promise<CatalogService[]> {
    return parseActivateServices(await activateJson(this.cfg, { action: 'getServicesList' }));
  }

  async listCountries(): Promise<CatalogCountry[]> {
    return parseActivateCountries(await activateJson(this.cfg, { action: 'getCountries' }));
  }

  /** GET hero-sms's REST offers endpoint (different base + header auth from handler_api). */
  private async offersApi(params: Record<string, string>): Promise<unknown> {
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      throw new ProviderConfigError('baseUrl and apiKey are required');
    }
    const url = new URL('/api/v1/activations/offers', this.cfg.baseUrl);
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: { Authorization: `ApiKey ${this.cfg.apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderConfigError(`${res.status} from hero-sms offers`);
    }
    return res.json();
  }

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const svc = mapService(this.cfg, q.serviceCode);
    const country = q.countryCode ? mapCountry(this.cfg, q.countryCode) : undefined;

    // Preferred: the REST offers endpoint — one tier per price point.
    try {
      const json = (await this.offersApi({
        services: svc,
        ...(country ? { countries: country } : {}),
      })) as { data?: Record<string, Record<string, { map?: Record<string, number> }>> };

      const byCountry = json?.data?.[svc] ?? {};
      const out: CatalogPrice[] = [];
      for (const [ctry, info] of Object.entries(byCountry)) {
        for (const [price, count] of Object.entries(info?.map ?? {})) {
          const priceMicro = Math.round(parseFloat(price) * 1_000_000);
          if (priceMicro > 0) {
            out.push({
              serviceCode: q.serviceCode,
              countryCode: ctry,
              priceMicro,
              stock: count != null ? Number(count) : null,
              operator: null,
            });
          }
        }
      }
      if (out.length) return out;
    } catch {
      /* fall through to the legacy single-tier endpoint */
    }

    // Fallback: handler_api getPrices — a single tier.
    const rows = parseActivatePrices(
      await activateJson(this.cfg, { action: 'getPrices', service: svc, country }),
    );
    return rows
      .filter((r) => r.serviceCode === svc)
      .map((r) => ({ ...r, serviceCode: q.serviceCode }));
  }
}
