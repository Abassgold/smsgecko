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
 * tiger-sms.com — SMS-Activate-style text API.
 * (FloZap: Server 5 / `rentTigerSmsNumber`, base `api.tiger-sms.com/stubs/handler_api.php`.)
 *
 * rent   GET ?action=getNumber&service=&country=&maxPrice=
 *        -> "ACCESS_NUMBER:<id>:<phone>"
 * poll   GET ?action=getStatus&id=<id>   -> "STATUS_OK:<code>" | "STATUS_WAIT_CODE" | …
 * cancel GET ?action=setStatus&id=<id>&status=8
 *        -> "ACCESS_CANCEL", or "EARLY_CANCEL_DENIED" for the first ~2 minutes
 *
 * Activation ids are 19 digits — always kept as strings, never Number()'d.
 */
export type TigerSmsConfig = ActivateConfig;

export class TigerSmsProvider implements SmsProvider {
  readonly key = 'tiger_sms';
  constructor(
    private readonly cfg: TigerSmsConfig,
    readonly label: string = 'tiger-sms',
  ) {}

  async rent(input: RentInput): Promise<RentResult> {
    const text = await activateGet(this.cfg, {
      action: 'getNumber',
      service: mapService(this.cfg, input.serviceSlug),
      country: mapCountry(this.cfg, input.countryCode),
      maxPrice: priceCapUsd(input),
    });
    const { providerRef, phoneNumber } = parseRentResponse(text);
    return { providerRef, phoneNumber, costMicro: null };
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const text = await activateGet(this.cfg, { action: 'getStatus', id: ctx.providerRef });
    // Tiger may answer ACCESS_CANCEL here once an order is cancelled (FloZap refundChecker).
    if (text.toUpperCase().startsWith('ACCESS_CANCEL')) return { status: 'canceled' };
    return parseStatusResponse(text);
  }

  async release(providerRef: string): Promise<void> {
    // status 8 = cancel activation
    await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 8 }).catch(
      () => undefined,
    );
  }

  async finish(providerRef: string): Promise<void> {
    // status 6 = complete activation (FloZap: markTigerSmsRentalAsDone)
    await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 6 }).catch(
      () => undefined,
    );
  }

  async resend(providerRef: string): Promise<void> {
    // status 3 = request another SMS on the same activation
    await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 3 }).catch(
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
    const country = q.countryCode ? mapCountry(this.cfg, q.countryCode) : undefined;

    // Preferred: getPricesV3 — one tier per upstream operator. Needs a country
    // (BAD_COUNTRY without one). Unlike smsbower, operators sit under
    // `.providers` and each price is an array:
    // { "<ctry>": { "<svc>": { price, count, providers: { "<id>": { count, price: [0.3], provider_id } } } } }
    if (country) {
      try {
        type Tier = { count?: number; price?: number | number[]; provider_id?: unknown };
        const json = (await activateJson(this.cfg, {
          action: 'getPricesV3',
          service: svc,
          country,
        })) as Record<string, Record<string, { providers?: Record<string, Tier> }>>;

        const out: CatalogPrice[] = [];
        for (const [ctry, byService] of Object.entries(json ?? {})) {
          for (const p of Object.values(byService?.[svc]?.providers ?? {})) {
            const price = Array.isArray(p?.price) ? p.price[0] : p?.price;
            const priceMicro = Math.round(Number(price) * 1_000_000);
            if (priceMicro > 0) {
              out.push({
                serviceCode: q.serviceCode,
                countryCode: ctry,
                priceMicro,
                stock: p?.count != null ? Number(p.count) : null,
                operator: p?.provider_id != null ? String(p.provider_id) : null,
              });
            }
          }
        }
        if (out.length) return out;
      } catch {
        /* fall through to the single-tier endpoint */
      }
    }

    // Fallback: handler_api getPrices — a single tier per country.
    const rows = parseActivatePrices(
      await activateJson(this.cfg, { action: 'getPrices', service: svc, country }),
    );
    return rows
      .filter((r) => r.serviceCode === svc)
      .map((r) => ({ ...r, serviceCode: q.serviceCode }));
  }
}
