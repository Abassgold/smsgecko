import { formatUsd } from '@smsgecko/shared';
import type { TransactionView } from '@smsgecko/shared';
import { Transaction, type TransactionDoc } from '../models/Transaction.js';
import type { UserDoc } from '../models/User.js';

export function toTransactionView(t: TransactionDoc): TransactionView {
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

export interface ListTransactionsParams {
  type: string;
  page: number;
  limit: number;
}

export async function listTransactions(user: UserDoc, params: ListTransactionsParams) {
  const filter = buildFilter(user._id, params.type);
  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit),
    Transaction.countDocuments(filter),
  ]);
  return {
    items: items.map(toTransactionView),
    total,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
  };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function exportTransactionsCsv(user: UserDoc): Promise<string> {
  const rows = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10_000);
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
  return lines.join('\n');
}
