import { asyncHandler } from '../lib/asyncHandler.js';
import type {
  CatalogSearchQuery,
  OffersQuery,
  QuoteQuery,
} from '../lib/validation/catalog.schema.js';
import { getQuote, listOffers, searchCountries, searchServices } from '../services/catalog.service.js';

export const listServices = asyncHandler(async (req, res) => {
  const { q, limit } = req.valid!.query as CatalogSearchQuery;
  res.json(await searchServices(q, limit));
});

export const listCountries = asyncHandler(async (req, res) => {
  const { q, limit } = req.valid!.query as CatalogSearchQuery;
  res.json(await searchCountries(q, limit));
});

export const listOffersForPair = asyncHandler(async (req, res) => {
  const { serviceId, countryId } = req.valid!.query as OffersQuery;
  res.json(await listOffers(serviceId, countryId));
});

export const quote = asyncHandler(async (req, res) => {
  const { serviceId, countryId } = req.valid!.query as QuoteQuery;
  res.json(await getQuote(serviceId, countryId));
});
