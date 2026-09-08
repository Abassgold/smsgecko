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
  mapService,
  parseActivatePrices,
  parseRentResponse,
  parseStatusResponse,
  priceCapUsd,
  type ActivateConfig,
} from './activateProtocol.js';

/**
 * daisySMS — SMS-Activate-style text API. US numbers only, so no country param
 * is sent. (FloZap: DAISYIO / `rentDaisyNumber`, base `daisysms.io/stubs/handler_api.php`.)
 *
 * rent   GET ?action=getNumber&service=&max_price=   -> "ACCESS_NUMBER:<id>:<phone>"
 * poll   GET ?action=getStatus&id=<id>               -> "STATUS_OK:<code>" | …
 * cancel GET ?action=setStatus&id=<id>&status=8
 * done   GET ?action=setStatus&id=<id>&status=6
 */
export type DaisySmsConfig = ActivateConfig;

export class DaisySmsProvider implements SmsProvider {
  readonly key = 'daisy_sms';
  constructor(
    private readonly cfg: DaisySmsConfig,
    readonly label: string = 'daisySMS',
  ) {}

  async rent(input: RentInput): Promise<RentResult> {
    const text = await activateGet(this.cfg, {
      action: 'getNumber',
      service: mapService(this.cfg, input.serviceSlug),
      max_price: priceCapUsd(input),
    });
    const { providerRef, phoneNumber } = parseRentResponse(text);
    return { providerRef, phoneNumber, costMicro: null };
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const text = await activateGet(this.cfg, { action: 'getStatus', id: ctx.providerRef });
    return parseStatusResponse(text, this.label);
  }

  async release(providerRef: string): Promise<void> {
    await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 8 }).catch(
      () => undefined,
    );
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      // getPrices returns a JSON map of services when the key is valid.
      const text = await activateGet(this.cfg, { action: 'getPrices' });
      const ok = text.trim().startsWith('{');
      return { ok, detail: ok ? 'prices reachable' : text.slice(0, 80) };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unreachable' };
    }
  }

  /** daisySMS is US-only; getPrices is keyed by service. */
  async listServices(): Promise<CatalogService[]> {
    const rows = parseActivatePrices(await activateJson(this.cfg, { action: 'getPrices' }));
    const codes = [...new Set(rows.map((r) => r.serviceCode))];
    return codes.map((code) => ({ code, name: code }));
  }

  async listCountries(): Promise<CatalogCountry[]> {
    return [{ code: '0', name: 'United States', iso2: 'us', dialCode: '1' }];
  }

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const svc = mapService(this.cfg, q.serviceCode);
    const rows = parseActivatePrices(await activateJson(this.cfg, { action: 'getPrices' }));
    return rows
      .filter((r) => r.serviceCode === svc)
      .map((r) => ({ ...r, countryCode: '0' }));
  }
}
