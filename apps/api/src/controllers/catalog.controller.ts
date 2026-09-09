import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validation.js';
import type {
  CatalogSearchQuery,
  OffersQuery,
  OperatorsQuery,
  QuoteQuery,
} from '../lib/validation/catalog.schema.js';
import {
  getQuote,
  listOffers,
  listOperators,
  searchCountries,
  searchServices,
} from '../services/catalog.service.js';

export const listServices = asyncHandler(async (req, res) => {
  const { q, limit } = valid<CatalogSearchQuery>(req, 'query');
  res.json(await searchServices(q, limit));
});

export const listCountries = asyncHandler(async (req, res) => {
  const { q, limit } = valid<CatalogSearchQuery>(req, 'query');
  res.json(await searchCountries(q, limit));
});

export const listOperatorsForPair = asyncHandler(async (req, res) => {
  const { serviceId, countryId } = valid<OperatorsQuery>(req, 'query');
  res.json(await listOperators(serviceId, countryId));
});

export const listOffersForPair = asyncHandler(async (req, res) => {
  const { serviceId, countryId, operator } = valid<OffersQuery>(req, 'query');
  res.json(await listOffers(serviceId, countryId, operator || undefined));
});

export const quote = asyncHandler(async (req, res) => {
  const { serviceId, countryId, operator } = valid<QuoteQuery>(req, 'query');
  res.json(await getQuote(serviceId, countryId, operator || undefined));
});
