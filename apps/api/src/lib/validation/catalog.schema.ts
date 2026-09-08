import * as yup from 'yup';
import { objectId } from './common.schema.js';

export const catalogSearchQuery = yup.object({
  q: yup.string().trim().max(64).optional(),
  limit: yup.number().integer().min(1).max(500).default(500),
});
export interface CatalogSearchQuery {
  q?: string;
  limit: number;
}

export const offersQuery = yup.object({
  serviceId: objectId.required(),
  countryId: objectId.required(),
});
export interface OffersQuery {
  serviceId: string;
  countryId: string;
}

export const quoteQuery = offersQuery;
export type QuoteQuery = OffersQuery;
