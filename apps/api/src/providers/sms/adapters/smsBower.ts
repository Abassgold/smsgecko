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
    const text = await activateGet(this.cfg, {
      action: 'getNumber',
      service: mapService(this.cfg, input.serviceSlug),
      country: mapCountry(this.cfg, input.countryCode),
      maxPrice: cap,
      minPrice: cap !== undefined ? 0 : undefined,
      userID: this.cfg.userId,
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

  async finish(providerRef: string): Promise<void> {
    // status 6 = complete activation (FloZap: markServer3RentalAsDone)
    await activateGet(this.cfg, { action: 'setStatus', id: providerRef, status: 6 }).catch(
      () => undefined,
    );
  }

  async resend(providerRef: string): Promise<void> {
    // status 3 = request another SMS
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
