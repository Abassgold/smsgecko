import { asyncHandler } from '../../lib/asyncHandler.js';
import type { OfferDisabledBody } from '../../lib/validation/admin/catalog.schema.js';
import { getCatalogStatus, listDisabledOffers, setOfferDisabled, syncNow } from '../../services/admin/catalog.service.js';

export const status = asyncHandler(async (_req, res) => {
  res.json({ ...(await getCatalogStatus()), disabledOffers: await listDisabledOffers() });
});

export const sync = asyncHandler(async (req, res) => {
  res.status(202).json(await syncNow(req.authUser!.id as string));
});

export const disableOffer = asyncHandler(async (req, res) => {
  res.json(await setOfferDisabled(req.authUser!.id as string, req.body as OfferDisabledBody));
});
