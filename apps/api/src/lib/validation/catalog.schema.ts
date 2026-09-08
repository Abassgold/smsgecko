import * as yup from 'yup';

export const catalogSearchQuery = yup.object({
  q: yup.string().trim().max(64).optional(),
  limit: yup.number().integer().min(1).max(500).default(500),
});
export interface CatalogSearchQuery {
  q?: string;
  limit: number;
}

/** serviceId / countryId are the active provider's own service/country codes. */
const providerCode = yup.string().trim().min(1).max(64);

export const offersQuery = yup.object({
  serviceId: providerCode.required(),
  countryId: providerCode.required(),
});
export interface OffersQuery {
  serviceId: string;
  countryId: string;
}

export const quoteQuery = offersQuery;
export type QuoteQuery = OffersQuery;
