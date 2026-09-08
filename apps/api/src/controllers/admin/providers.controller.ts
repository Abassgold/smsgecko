import { asyncHandler } from '../../lib/asyncHandler.js';
import { valid } from '../../middleware/validation.js';
import type { IdParams } from '../../lib/validation/common.schema.js';
import {
  createProvider,
  deleteProvider,
  getProvider,
  listProviders,
  reorderProviders,
  testProvider,
  updateProvider,
  type CreateProviderInput,
  type UpdateProviderInput,
} from '../../services/admin/providers.service.js';

export const list = asyncHandler(async (_req, res) => {
  res.json(await listProviders());
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await createProvider(req.body as CreateProviderInput));
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  res.json(await getProvider(id));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  res.json(await updateProvider(id, req.body as UpdateProviderInput));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  await deleteProvider(id);
  res.json({ ok: true as const });
});

export const test = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  res.json(await testProvider(id));
});

export const reorder = asyncHandler(async (req, res) => {
  const { orderedIds } = req.body as { orderedIds: string[] };
  res.json(await reorderProviders(orderedIds));
});
