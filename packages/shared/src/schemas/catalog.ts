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
  id: string;
  serviceId: string;
  countryId: string;
  operator: string | null;
  priceMicro: number;
  stock: number;
}

/** Cheapest in-stock offer for a service×country, for the New Order widget. */
export interface QuoteResponse {
  serviceId: string;
  countryId: string;
  available: boolean;
  bestOffer: OfferView | null;
}
