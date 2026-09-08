import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validate.js';
import type { IdParams } from '../lib/validation/common.schema.js';
import { createKey, listKeys, revokeKey } from '../services/apikeys.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await listKeys(req.authUser!));
});

export const create = asyncHandler(async (req, res) => {
  const { label } = req.body as { label: string };
  res.status(201).json(await createKey(req.authUser!, label));
});

export const revoke = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  await revokeKey(req.authUser!, id);
  res.json({ ok: true as const });
});
