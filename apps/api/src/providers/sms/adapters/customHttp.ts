import { usdToMicro } from '@smsgecko/shared';
import {
  NoStockError,
  ProviderConfigError,
  type CatalogCountry,
  type CatalogPrice,
  type CatalogService,
  type HealthResult,
  type PollContext,
  type PollResult,
  type RentInput,
  type RentResult,
  type SmsProvider,
} from '../types.js';

/**
 * Generic HTTP adapter. Point it at any reseller by configuring templated
 * endpoints + a small response map. Covers both JSON REST APIs and the
 * handler-style text APIs (SMS-Activate / 5SIM / SMSHub family).
 *
 * Path templates may contain {service} {country} {ref}. The api key is added
 * per `authMode`. NO_NUMBERS-type responses raise NoStockError so the router
 * falls through to the next provider; auth errors raise ProviderConfigError.
 */
export interface CustomHttpConfig {
  baseUrl?: string;
  apiKey?: string;
  authMode?: 'query' | 'header' | 'bearer';
  authParam?: string; // query param or header name
  method?: 'GET' | 'POST';
  parseMode?: 'json' | 'text';
  rentPath?: string;
  statusPath?: string;
  cancelPath?: string;
  /** Optional "mark done" call (e.g. handler_api setStatus status=6). */
  finishPath?: string;
  /** Optional "request another SMS" call (e.g. handler_api setStatus status=3). */
  resendPath?: string;
  healthPath?: string;
  map?: {
    refPath?: string;
    phonePath?: string;
    priceUsdPath?: string;
    codePath?: string;
    statusPath?: string;
    receivedValues?: string[];
    canceledValues?: string[];
    noStockValues?: string[];
    textRentRegex?: string; // capture groups: 1=id 2=phone
    textReceivedRegex?: string; // capture group 1 = code
    textCanceledValues?: string[];
    textNoStockValues?: string[];
  };
}

const DEFAULT_NO_STOCK = ['NO_NUMBERS', 'NO_NUMBER', 'no free phones', 'NO_STOCK'];
const AUTH_ERRORS = ['BAD_KEY', 'ERROR_SQL', 'UNAUTHORIZED', 'invalid api key', 'BAD_ACTION'];

export class CustomHttpProvider implements SmsProvider {
  readonly key = 'custom_http';
  private readonly cfg: CustomHttpConfig;
  constructor(
    cfg: CustomHttpConfig,
    readonly label: string = 'HTTP provider',
  ) {
    this.cfg = cfg;
  }

  private assertConfigured(): void {
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      throw new ProviderConfigError(`${this.label}: baseUrl and apiKey are required`);
    }
  }

  private buildUrl(path: string, vars: Record<string, string>): URL {
    let rendered = path;
    for (const [k, v] of Object.entries(vars)) {
      rendered = rendered.replaceAll(`{${k}}`, encodeURIComponent(v));
    }
    const url = new URL(rendered, this.cfg.baseUrl);
    if ((this.cfg.authMode ?? 'query') === 'query') {
      url.searchParams.set(this.cfg.authParam ?? 'api_key', this.cfg.apiKey!);
    }
    return url;
  }

  private headers(): Record<string, string> {
    const mode = this.cfg.authMode ?? 'query';
    if (mode === 'header') return { [this.cfg.authParam ?? 'X-API-Key']: this.cfg.apiKey! };
    if (mode === 'bearer') return { Authorization: `Bearer ${this.cfg.apiKey}` };
    return {};
  }

  private async call(path: string, vars: Record<string, string>): Promise<{ text: string; json: unknown }> {
    const url = this.buildUrl(path, vars);
    const res = await fetch(url, {
      method: this.cfg.method ?? 'GET',
      headers: { accept: 'application/json, text/plain', ...this.headers() },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* text response */
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderConfigError(`${this.label}: ${res.status} from provider`);
    }
    const up = text.toUpperCase();
    if (AUTH_ERRORS.some((e) => up.includes(e.toUpperCase()))) {
      throw new ProviderConfigError(`${this.label}: ${text.slice(0, 120)}`);
    }
    return { text, json };
  }

  async rent(input: RentInput): Promise<RentResult> {
    this.assertConfigured();
    if (!this.cfg.rentPath) throw new ProviderConfigError(`${this.label}: rentPath not set`);

    const { text, json } = await this.call(this.cfg.rentPath, {
      service: input.serviceSlug,
      country: input.countryCode,
      dial: input.dialCode,
    });

    const noStock = [...DEFAULT_NO_STOCK, ...(this.cfg.map?.textNoStockValues ?? [])];
    if (noStock.some((v) => text.toUpperCase().includes(v.toUpperCase()))) {
      throw new NoStockError(`${this.label}: no numbers`);
    }

    const map = this.cfg.map ?? {};
    if ((this.cfg.parseMode ?? 'text') === 'text' && map.textRentRegex) {
      const m = new RegExp(map.textRentRegex).exec(text);
      if (!m) throw new NoStockError(`${this.label}: unexpected rent response`);
      return { providerRef: m[1] ?? '', phoneNumber: normalizePhone(m[2] ?? ''), costMicro: null };
    }

    const ref = pick(json, map.refPath);
    const phone = pick(json, map.phonePath);
    if (!ref || !phone) throw new NoStockError(`${this.label}: no ref/phone in response`);
    const priceUsd = map.priceUsdPath ? Number(pick(json, map.priceUsdPath)) : NaN;
    return {
      providerRef: String(ref),
      phoneNumber: normalizePhone(String(phone)),
      costMicro: Number.isFinite(priceUsd) ? usdToMicro(priceUsd) : null,
    };
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    this.assertConfigured();
    if (!this.cfg.statusPath) return { status: 'waiting' };
    const { text, json } = await this.call(this.cfg.statusPath, { ref: ctx.providerRef });
    const map = this.cfg.map ?? {};

    if ((this.cfg.parseMode ?? 'text') === 'text') {
      if (map.textReceivedRegex) {
        const m = new RegExp(map.textReceivedRegex).exec(text);
        if (m) return { status: 'received', code: (m[1] ?? '').trim(), messages: [{ sender: '', text: (m[1] ?? '').trim() }] };
      }
      if ((map.textCanceledValues ?? ['STATUS_CANCEL']).some((v) => text.toUpperCase().includes(v.toUpperCase()))) {
        return { status: 'canceled' };
      }
      return { status: 'waiting' };
    }

    const status = String(pick(json, map.statusPath) ?? '');
    if ((map.receivedValues ?? ['received', 'completed', 'success']).includes(status)) {
      const code = String(pick(json, map.codePath) ?? '');
      return { status: 'received', code, messages: code ? [{ sender: '', text: code }] : [] };
    }
    if ((map.canceledValues ?? ['canceled', 'cancelled', 'timeout']).includes(status)) {
      return { status: 'canceled' };
    }
    return { status: 'waiting' };
  }

  async release(providerRef: string): Promise<void> {
    if (!this.cfg.baseUrl || !this.cfg.apiKey || !this.cfg.cancelPath) return;
    await this.call(this.cfg.cancelPath, { ref: providerRef }).catch(() => undefined);
  }

  async finish(providerRef: string): Promise<void> {
    if (!this.cfg.baseUrl || !this.cfg.apiKey || !this.cfg.finishPath) return;
    await this.call(this.cfg.finishPath, { ref: providerRef }).catch(() => undefined);
  }

  async resend(providerRef: string): Promise<void> {
    if (!this.cfg.baseUrl || !this.cfg.apiKey || !this.cfg.resendPath) return;
    await this.call(this.cfg.resendPath, { ref: providerRef }).catch(() => undefined);
  }

  async healthCheck(): Promise<HealthResult> {
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      return { ok: false, detail: 'baseUrl and apiKey are required' };
    }
    const path = this.cfg.healthPath ?? this.cfg.statusPath ?? this.cfg.rentPath;
    if (!path) return { ok: false, detail: 'no endpoint to probe' };
    try {
      const { text } = await this.call(path, { ref: '0', service: 'test', country: 'us', dial: '1' });
      return { ok: true, detail: `reachable (${text.slice(0, 60)})` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unreachable' };
    }
  }

  // The generic adapter has no live catalog — it can rent/poll a configured
  // endpoint but does not know how to enumerate a provider's services. Use a
  // dedicated adapter (hero_sms / sms_pool / …) to drive the storefront.
  async listServices(): Promise<CatalogService[]> {
    return [];
  }
  async listCountries(): Promise<CatalogCountry[]> {
    return [];
  }
  async listPrices(): Promise<CatalogPrice[]> {
    return [];
  }
}

function pick(obj: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}
