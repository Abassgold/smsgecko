import { Router } from 'express';
import { formatUsd, transactionsQuery } from '@smsgecko/shared';
import { Transaction, type TransactionDoc } from '../../models/Transaction.js';
import { parse } from '../../lib/validate.js';
import { requireUser } from '../../middleware/auth.js';

function toTransactionView(t: TransactionDoc) {
  return {
    id: t.id as string,
    type: t.type,
    amountMicro: t.amountMicro,
    balanceAfterMicro: t.balanceAfterMicro,
    description: t.description,
    orderId: t.orderId ? String(t.orderId) : null,
    depositId: t.depositId ? String(t.depositId) : null,
    createdAt: (t.get('createdAt') as Date).toISOString(),
  };
}

function buildFilter(userId: unknown, type: string): Record<string, unknown> {
  const filter: Record<string, unknown> = { userId };
  if (type === 'credits') filter.amountMicro = { $gt: 0 };
  else if (type === 'debits') filter.amountMicro = { $lt: 0 };
  else if (type !== 'all') filter.type = type;
  return filter;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export const walletRouter = Router();
// requireUser is applied per-route (not as a blanket `.use`) so that unmatched
// paths fall through to the other router mounted on /api/v1 (deposits, incl. the
// public payment webhook).

walletRouter.get('/wallet', requireUser, (req, res) => {
  res.json({ balanceMicro: req.authUser!.balanceMicro });
});

walletRouter.get('/transactions', requireUser, async (req, res) => {
  const { type, page, limit } = parse(transactionsQuery, req.query);
  const filter = buildFilter(req.authUser!._id, type);
  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);
  res.json({
    items: items.map(toTransactionView),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

walletRouter.get('/transactions/export.csv', requireUser, async (req, res) => {
  const filter = { userId: req.authUser!._id };
  const rows = await Transaction.find(filter).sort({ createdAt: -1 }).limit(10_000);

  const header = ['date', 'type', 'amount_usd', 'balance_after_usd', 'description'];
  const lines = [header.join(',')];
  for (const t of rows) {
    lines.push(
      [
        (t.get('createdAt') as Date).toISOString(),
        t.type,
        formatUsd(t.amountMicro, { symbol: false }),
        formatUsd(t.balanceAfterMicro, { symbol: false }),
        csvCell(t.description),
      ].join(','),
    );
  }

  res
    .type('text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="transactions.csv"')
    .send(lines.join('\n'));
});
