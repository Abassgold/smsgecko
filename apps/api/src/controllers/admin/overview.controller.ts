import { asyncHandler } from '../../lib/asyncHandler.js';
import { getOverview } from '../../services/admin/overview.service.js';

export const overview = asyncHandler(async (_req, res) => {
  res.json(await getOverview());
});
