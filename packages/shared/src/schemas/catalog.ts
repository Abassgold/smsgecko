export interface ServiceView {
  id: string;
  slug: string;
  name: string;
  iconKey: string;
  popular: boolean;
}

export interface CountryView {
  id: string;
  code: string;
  name: string;
  dialCode: string;
  flagEmoji: string;
}

export interface OfferView {
  /** "<serviceId>::<countryId>" for the cheapest tier, "…::<i>" for tier i. */
  id: string;
  serviceId: string;
  countryId: string;
  /** Upstream operator / route, when the provider distinguishes them. */
  operator: string | null;
  /** Customer price (micro-USD, markup applied). */
  priceMicro: number;
  /** Numbers available, or null when the provider doesn't report it. */
  stock: number | null;
}

/**
 * Every price tier for a service×country, cheapest first — the New Order widget
 * lets the user pick one. `bestOffer` is the cheapest in-stock tier (a shortcut
 * for callers that don't show the list).
 */
export interface QuoteResponse {
  serviceId: string;
  countryId: string;
  available: boolean;
  offers: OfferView[];
  bestOffer: OfferView | null;
}
