import { asyncHandler } from '../../lib/asyncHandler.js';
import type { IdParams } from '../../lib/validation/common.schema.js';
import type { AdminOffersQuery, BulkOfferBody } from '../../lib/validation/admin/catalog.schema.js';
import * as svc from '../../services/admin/catalog.service.js';

/* ---- services ---- */

export const listServices = asyncHandler(async (_req, res) => {
  res.json(await svc.listServices());
});

export const createService = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createService(req.body as svc.ServiceInput));
});

export const updateService = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  res.json(await svc.updateService(id, req.body as svc.ServiceInput));
});

export const deleteService = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  await svc.deleteService(id);
  res.json({ ok: true as const });
});

/* ---- countries ---- */

export const listCountries = asyncHandler(async (_req, res) => {
  res.json(await svc.listCountries());
});

export const createCountry = asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createCountry(req.body as svc.CountryInput));
});

export const updateCountry = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  res.json(await svc.updateCountry(id, req.body as svc.CountryInput));
});

export const deleteCountry = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  await svc.deleteCountry(id);
  res.json({ ok: true as const });
});

/* ---- offers ---- */

export const listOffers = asyncHandler(async (req, res) => {
  const query = req.valid!.query as AdminOffersQuery;
  const { items, total, totalPages } = await svc.listOffers(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});

export const createOffer = asyncHandler(async (req, res) => {
  await svc.createOffer(req.body as svc.OfferInput);
  res.status(201).json({ ok: true as const });
});

export const updateOffer = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  await svc.updateOffer(id, req.body as svc.OfferInput);
  res.json({ ok: true as const });
});

export const deleteOffer = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  await svc.deleteOffer(id);
  res.json({ ok: true as const });
});

export const bulkOffers = asyncHandler(async (req, res) => {
  res.json(await svc.bulkOffers(req.body as BulkOfferBody));
});
