import { asyncHandler } from '../../lib/asyncHandler.js';
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
  const query = req.valid!.query as AdminTransactionsQuery;
  const { items, total, totalPages } = await listTransactions(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});

export const deposits = asyncHandler(async (req, res) => {
  const query = req.valid!.query as AdminDepositsQuery;
  const { items, total, totalPages } = await listDeposits(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});

export const updateDeposit = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  const { status } = req.body as { status: 'confirmed' | 'failed' };
  res.json(await updateDepositStatus(id, status));
});
