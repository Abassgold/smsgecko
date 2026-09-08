import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validation.js';
import type {
  CatalogSearchQuery,
  OffersQuery,
  QuoteQuery,
} from '../lib/validation/catalog.schema.js';
import { getQuote, listOffers, searchCountries, searchServices } from '../services/catalog.service.js';

export const listServices = asyncHandler(async (req, res) => {
  const { q, limit } = valid<CatalogSearchQuery>(req, 'query');
  res.json(await searchServices(q, limit));
});

export const listCountries = asyncHandler(async (req, res) => {
  const { q, limit } = valid<CatalogSearchQuery>(req, 'query');
  res.json(await searchCountries(q, limit));
});

export const listOffersForPair = asyncHandler(async (req, res) => {
  const { serviceId, countryId } = valid<OffersQuery>(req, 'query');
  res.json(await listOffers(serviceId, countryId));
});

export const quote = asyncHandler(async (req, res) => {
  const { serviceId, countryId } = valid<QuoteQuery>(req, 'query');
  res.json(await getQuote(serviceId, countryId));
});
