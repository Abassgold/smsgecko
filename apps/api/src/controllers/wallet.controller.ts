import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validate.js';
import type { TransactionsQuery } from '../lib/validation/wallet.schema.js';
import { exportTransactionsCsv, listTransactions } from '../services/wallet.service.js';

export const getBalance = asyncHandler(async (req, res) => {
  res.json({ balanceMicro: req.authUser!.balanceMicro });
});

export const listTransactionsHandler = asyncHandler(async (req, res) => {
  const { type, page, limit } = valid<TransactionsQuery>(req, 'query');
  const { items, total, totalPages } = await listTransactions(req.authUser!, { type, page, limit });
  res.json({ items, page, limit, total, totalPages });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const csv = await exportTransactionsCsv(req.authUser!);
  res
    .type('text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="transactions.csv"')
    .send(csv);
});
