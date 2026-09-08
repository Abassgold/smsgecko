import { asyncHandler } from '../../lib/asyncHandler.js';
import { valid } from '../../middleware/validate.js';
import type { IdParams } from '../../lib/validation/common.schema.js';
import type { AdminUsersQuery } from '../../lib/validation/admin/users.schema.js';
import {
  adjustBalance,
  getUserDetail,
  listUsers,
  updateUser,
  type UpdateUserInput,
} from '../../services/admin/users.service.js';

export const list = asyncHandler(async (req, res) => {
  const query = valid<AdminUsersQuery>(req, 'query');
  const { items, total, totalPages } = await listUsers(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  res.json(await getUserDetail(id));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  res.json(await updateUser(id, req.body as UpdateUserInput, req.authUser!.id as string));
});

export const adjust = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  const { amountMicro, reason } = req.body as { amountMicro: number; reason: string };
  res.json(await adjustBalance(id, amountMicro, reason));
});
