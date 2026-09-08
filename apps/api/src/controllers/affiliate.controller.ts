import type { AcceptTermsBody } from '@smsgecko/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { acceptTerms, buildAffiliateView } from '../services/affiliate.service.js';

export const get = asyncHandler(async (req, res) => {
  res.json(await buildAffiliateView(req.authUser!));
});

export const accept = asyncHandler(async (req, res) => {
  const { version } = req.body as AcceptTermsBody;
  res.json(await acceptTerms(req.authUser!, version));
});
