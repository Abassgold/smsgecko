import { z } from 'zod';
import { objectId } from './common';

export const serviceView = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  iconKey: z.string(),
  popular: z.boolean(),
});
export type ServiceView = z.infer<typeof serviceView>;

export const countryView = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  dialCode: z.string(),
  flagEmoji: z.string(),
});
export type CountryView = z.infer<typeof countryView>;

export const offerView = z.object({
  id: z.string(),
  serviceId: z.string(),
  countryId: z.string(),
  operator: z.string().nullable(),
  priceMicro: z.number().int(),
  stock: z.number().int(),
});
export type OfferView = z.infer<typeof offerView>;

export const catalogSearchQuery = z.object({
  q: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

export const offersQuery = z.object({
  serviceId: objectId,
  countryId: objectId,
});

/** Cheapest in-stock offer for a service×country, for the New Order widget. */
export const quoteQuery = offersQuery;
export const quoteResponse = z.object({
  serviceId: z.string(),
  countryId: z.string(),
  available: z.boolean(),
  bestOffer: offerView.nullable(),
});
export type QuoteResponse = z.infer<typeof quoteResponse>;
