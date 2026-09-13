import type { SettingsPatch } from '@smsgecko/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { getSettings } from '../../lib/settings.js';
import { applySettingsPatch } from '../../services/admin/settings.service.js';

export const get = asyncHandler(async (_req, res) => {
  res.json(await getSettings());
});

export const patch = asyncHandler(async (req, res) => {
  res.json(await applySettingsPatch(req.body as SettingsPatch, req.authUser!.id as string));
});
