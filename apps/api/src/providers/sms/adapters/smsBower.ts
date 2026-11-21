import type {
  CatalogCountry,
  CatalogPrice,
  CatalogQuery,
  CatalogService,
  HealthResult,
  PollContext,
  PollResult,
  RentInput,
  ReleaseResult,
  RentResult,
  SmsProvider,
} from '../types.js';
import {
  assertResendAccepted,
  activateGet,
  activateJson,
  mapCountry,
  mapService,
  parseActivateCountries,
  parseActivatePrices,
  parseActivateServices,
  parseReleaseResponse,
  parseRentResponse,
  parseStatusResponse,
  priceCapUsd,
  type ActivateConfig,
} from './activateProtocol.js';
import { changeRoute, rerouteListing } from '../changeRoute.js';

/**
 * smsbower — SMS-Activate-style text API. Wants a `userID` and both
 * `minPrice`/`maxPrice` on getNumber. (FloZap: SERVER3 / `rentServer3Number`,
 * base `smsbower.page/stubs/handler_api.php`.)
 *
 * rent   GET ?action=getNumber&service=&country=&maxPrice=&minPrice=&userID=
 *        -> "ACCESS_NUMBER:<id>:<phone>"
 * poll   GET ?action=getStatus&id=<id>
 * cancel GET ?action=setStatus&id=<id>&status=8
 */
export interface SmsBowerConfig extends ActivateConfig {
  /** smsbower requires this on getNumber. */
  userId?: string;
}

export class SmsBowerProvider implements SmsProvider {
  readonly key = 'sms_bower';
  constructor(
    private readonly cfg: SmsBowerConfig,
    readonly label: string = 'smsbower',
  ) {}

  async rent(input: RentInput): Promise<RentResult> {
    const cap = priceCapUsd(input);
    const service = mapService(this.cfg, input.serviceSlug);
    // e.g. US WhatsApp is served from Canada (see changeRoute.ts); the cap matches that country's price.
    const country = changeRoute(mapCountry(this.cfg, input.countryCode), service);
    const text = await activateGet(this.cfg, {
      action: 'getNumber',
      service,
      country,
      maxPrice: cap,
      minPrice: cap !== undefined ? 0 : undefined,
      userID: this.cfg.userId,
    });
    const { providerRef, phoneNumber } = parseRentResponse(text);
    return { providerRef, phoneNumber, costMicro: null };
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const text = await activateGet(this.cfg, { action: 'getStatus', id: ctx.providerRef });
    return parseStatusResponse(text);
  }

  async release(providerRef: string): Promise<ReleaseResult> {
    // status 8 = cancel activation
    return parseReleaseResponse(
      await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 8 }),
    );
  }

  async finish(providerRef: string): Promise<void> {
    // status 6 = complete activation (FloZap: markServer3RentalAsDone)
    await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 6 }).catch(
      () => undefined,
    );
  }

  async resend(providerRef: string): Promise<void> {
    // status 3 = request another SMS
    assertResendAccepted(
      await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 3 }),
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

  async listCountryPrices(countryCode: string): Promise<CatalogPrice[]> {
    const country = mapCountry(this.cfg, countryCode);
    // getPricesV3 with a country and no service: { "<ctry>": { "<svc>": { "<providerId>": { count, price, provider_id } } } }
    const json = (await activateJson(this.cfg, { action: 'getPricesV3', country })) as Record<
      string,
      Record<string, Record<string, { count?: number; price?: number; provider_id?: unknown }>>
    >;
    const byService = json?.[country];
    if (!byService || typeof byService !== 'object') throw new Error('smsbower getPricesV3: unexpected response');
    const out: CatalogPrice[] = [];
    for (const [svc, providers] of Object.entries(byService)) {
      for (const p of Object.values(providers ?? {})) {
        const priceMicro = Math.round(Number(p?.price) * 1_000_000);
        if (priceMicro > 0) {
          out.push({
            serviceCode: svc,
            countryCode,
            priceMicro,
            stock: p?.count != null ? Number(p.count) : null,
            operator: p?.provider_id != null ? String(p.provider_id) : null,
          });
        }
      }
    }
    return out;
  }

  async listPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const rows = await this.fetchPrices(q);
    // One country asked for: rows already come from the rerouted country. All countries: show the destination's tiers.
    return q.countryCode ? rows : rerouteListing(rows, mapService(this.cfg, q.serviceCode));
  }

  private async fetchPrices(q: CatalogQuery): Promise<CatalogPrice[]> {
    const svc = mapService(this.cfg, q.serviceCode);
    const country = q.countryCode ? changeRoute(mapCountry(this.cfg, q.countryCode), svc) : undefined;

    // Preferred: getPricesV3 — one tier per upstream operator (provider_id).
    // Shape: { "<ctry>": { "<svc>": { "<providerId>": { count, price, provider_id } } } }
    try {
      const json = (await activateJson(this.cfg, {
        action: 'getPricesV3',
        service: svc,
        country,
      })) as Record<
        string,
        Record<string, Record<string, { count?: number; price?: number; provider_id?: unknown }>>
      >;

      const out: CatalogPrice[] = [];
      for (const [ctry, byService] of Object.entries(json ?? {})) {
        for (const p of Object.values(byService?.[svc] ?? {})) {
          const priceMicro = Math.round(Number(p?.price) * 1_000_000);
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
