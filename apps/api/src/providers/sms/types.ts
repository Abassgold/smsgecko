import type { OrderDoc } from '../../models/Order.js';

export interface RentInput {
  serviceSlug: string;
  countryCode: string;
  dialCode: string;
  /** Refuse the provider if its price exceeds this (micro-USD). Advisory. */
  maxPriceMicro?: number;
}

export interface RentResult {
  /** The provider's own activation / order id. */
  providerRef: string;
  /** E.164-ish, e.g. "+6281234567890". */
  phoneNumber: string;
  /** What the provider charged us, if known (used for margin reporting). */
  costMicro?: number | null;
  /**
   * Earliest time a code is expected to be available, if the provider can say.
   * Real adapters leave this unset; only the test fixture uses it.
   */
  deliverAt?: Date | null;
}

export interface PollMessage {
  sender: string;
  text: string;
  receivedAt?: Date;
}

export interface PollResult {
  status: 'waiting' | 'received' | 'canceled';
  code?: string | null;
  messages?: PollMessage[];
}

export interface PollContext {
  providerRef: string;
  order: OrderDoc;
}

export interface HealthResult {
  ok: boolean;
  detail?: string;
}

/* ---------------- live catalog ---------------- */

export interface CatalogService {
  /** The provider's own service code (e.g. "wa"). Sent back to the provider verbatim. */
  code: string;
  /** Human label from the provider (e.g. "WhatsApp"). */
  name: string;
}

export interface CatalogCountry {
  /** The provider's own country code/id (e.g. "187" or "us"). */
  code: string;
  name: string;
  /** Best-effort ISO 3166-1 alpha-2, for flag rendering. May be absent. */
  iso2?: string;
  /** Best-effort international dialing prefix without "+". May be absent. */
  dialCode?: string;
}

export interface CatalogPrice {
  serviceCode: string;
  countryCode: string;
  /** The provider's raw price in micro-USD, before our markup. */
  priceMicro: number;
  /** Numbers available, when the provider reports it. */
  stock?: number | null;
  operator?: string | null;
}

export interface CatalogQuery {
  serviceCode: string;
  /** Omit to price the service across every country the provider offers. */
  countryCode?: string;
}

export interface SmsProvider {
  /** Adapter kind, e.g. "mock" | "custom_http". */
  readonly key: string;
  /** Admin-facing display name (from the ProviderConfig). */
  readonly label: string;

  rent(input: RentInput): Promise<RentResult>;
  poll(ctx: PollContext): Promise<PollResult>;
  /** Cancel an active rental (SMS-Activate status 8, smscode /orders/cancel, smspool /sms/cancel). */
  release(providerRef: string): Promise<void>;
  /**
   * Tell the provider we're done with the number (SMS-Activate status 6,
   * smscode /orders/finish). Optional — providers that auto-finalise omit it.
   * Best-effort; never throws to the caller.
   */
  finish?(providerRef: string): Promise<void>;
  healthCheck(): Promise<HealthResult>;

  /** Live catalog — the storefront is driven by the highest-priority enabled provider. */
  listServices(): Promise<CatalogService[]>;
  listCountries(): Promise<CatalogCountry[]>;
  listPrices(query: CatalogQuery): Promise<CatalogPrice[]>;
}

/** No number available for this service/country — the router falls through to the next provider. */
export class NoStockError extends Error {
  constructor(message = 'No stock at provider') {
    super(message);
    this.name = 'NoStockError';
  }
}

/** Credentials missing or rejected — recorded, and the router falls through. */
export class ProviderConfigError extends Error {
  constructor(message = 'Provider is not configured') {
    super(message);
    this.name = 'ProviderConfigError';
  }
}
