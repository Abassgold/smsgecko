import { asyncHandler } from '../../lib/asyncHandler.js';
import { valid } from '../../middleware/validation.js';
import type { IdParams } from '../../lib/validation/common.schema.js';
import type {
  AdminDepositsQuery,
  AdminTransactionsQuery,
} from '../../lib/validation/admin/finance.schema.js';
import {
  listDeposits,
  listTransactions,
  updateDepositStatus,
} from '../../services/admin/finance.service.js';

export const transactions = asyncHandler(async (req, res) => {
  const query = valid<AdminTransactionsQuery>(req, 'query');
  const { items, total, totalPages } = await listTransactions(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});

export const deposits = asyncHandler(async (req, res) => {
  const query = valid<AdminDepositsQuery>(req, 'query');
  const { items, total, totalPages } = await listDeposits(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});

export const updateDeposit = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  const { status } = req.body as { status: 'confirmed' | 'failed' };
  res.json(await updateDepositStatus(id, status, req.authUser!.id as string));
});
