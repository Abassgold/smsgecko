import * as yup from 'yup';
import { objectId, paginationFields } from '../common.schema.js';

/* ---- services ---- */

export const createServiceBody = yup.object({
  slug: yup
    .string()
    .trim()
    .lowercase()
    .matches(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes only')
    .min(2)
    .max(40)
    .required(),
  name: yup.string().trim().min(2).max(80).required(),
  iconKey: yup.string().trim().min(1).max(40).required(),
  aliases: yup.array().of(yup.string().trim().min(1).max(40).required()).max(10).default([]),
  popular: yup.boolean().default(false),
  sortOrder: yup.number().integer().default(1000),
});

export const updateServiceBody = yup.object({
  name: yup.string().trim().min(2).max(80).optional(),
  iconKey: yup.string().trim().min(1).max(40).optional(),
  aliases: yup.array().of(yup.string().trim().min(1).max(40).required()).max(10).optional(),
  popular: yup.boolean().optional(),
  sortOrder: yup.number().integer().optional(),
});

/* ---- countries ---- */

export const createCountryBody = yup.object({
  code: yup
    .string()
    .trim()
    .lowercase()
    .matches(/^[a-z]{2}$/, 'ISO 3166-1 alpha-2')
    .required(),
  name: yup.string().trim().min(2).max(80).required(),
  dialCode: yup
    .string()
    .trim()
    .matches(/^\d{1,4}$/, '1–4 digits')
    .required(),
  flagEmoji: yup.string().trim().min(1).max(8).required(),
  sortOrder: yup.number().integer().default(1000),
});

export const updateCountryBody = yup.object({
  name: yup.string().trim().min(2).max(80).optional(),
  dialCode: yup
    .string()
    .trim()
    .matches(/^\d{1,4}$/, '1–4 digits')
    .optional(),
  flagEmoji: yup.string().trim().min(1).max(8).optional(),
  sortOrder: yup.number().integer().optional(),
});

/* ---- offers ---- */

export const adminOffersQuery = yup.object({
  serviceId: objectId.optional(),
  countryId: objectId.optional(),
  ...paginationFields(200, 50),
});
export interface AdminOffersQuery {
  serviceId?: string;
  countryId?: string;
  page: number;
  limit: number;
}

export const createOfferBody = yup.object({
  serviceId: objectId.required(),
  countryId: objectId.required(),
  operator: yup.string().trim().max(40).nullable().default(null),
  priceMicro: yup.number().integer().min(0).required(),
  stock: yup.number().integer().min(0).default(0),
  active: yup.boolean().default(true),
});

export const updateOfferBody = yup.object({
  priceMicro: yup.number().integer().min(0).optional(),
  stock: yup.number().integer().min(0).optional(),
  active: yup.boolean().optional(),
  operator: yup.string().trim().max(40).nullable().optional(),
});

export const bulkOfferBody = yup.object({
  serviceId: objectId.optional(),
  countryId: objectId.optional(),
  setPriceMicro: yup.number().integer().min(0).optional(),
  adjustPricePct: yup.number().min(-90).max(1000).optional(),
  setStock: yup.number().integer().min(0).optional(),
  active: yup.boolean().optional(),
});
export interface BulkOfferBody {
  serviceId?: string;
  countryId?: string;
  setPriceMicro?: number;
  adjustPricePct?: number;
  setStock?: number;
  active?: boolean;
}
