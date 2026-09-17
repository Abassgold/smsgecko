import type { CreateBroadcastBody } from '@smsgecko/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { valid } from '../../middleware/validation.js';
import type { IdParams } from '../../lib/validation/common.schema.js';
import type { AdminBroadcastsQuery } from '../../lib/validation/admin/broadcasts.schema.js';
import { createBroadcast, getBroadcast, listBroadcasts } from '../../services/admin/broadcasts.service.js';

export const create = asyncHandler(async (req, res) => {
  const body = valid<CreateBroadcastBody>(req, 'body');
  res.status(201).json(await createBroadcast(req.authUser!.id as string, body));
});

export const list = asyncHandler(async (req, res) => {
  const query = valid<AdminBroadcastsQuery>(req, 'query');
  const { items, total, totalPages } = await listBroadcasts(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  res.json(await getBroadcast(id));
});
