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

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const svc = mapService(this.cfg, q.serviceCode);
    const rows = parseActivatePrices(
      await activateJson(this.cfg, {
        action: 'getPrices',
        service: svc,
        country: q.countryCode ? mapCountry(this.cfg, q.countryCode) : undefined,
      }),
    );
    return rows.filter((r) => r.serviceCode === svc);
  }
}
