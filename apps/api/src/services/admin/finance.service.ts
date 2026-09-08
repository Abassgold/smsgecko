import type { AdminDepositRow, AdminTransactionRow } from '@smsgecko/shared';
import { Transaction } from '../../models/Transaction.js';
import { Deposit, type DepositDoc } from '../../models/Deposit.js';
import { User } from '../../models/User.js';
import { conflict, notFound } from '../../lib/errors.js';
import { confirmDeposit } from '../deposits.service.js';
import type {
  AdminDepositsQuery,
  AdminTransactionsQuery,
} from '../../lib/validation/admin/finance.schema.js';

async function emailMap(userIds: unknown[]): Promise<Map<string, string>> {
  const users = await User.find({ _id: { $in: userIds } }, { email: 1 });
  return new Map(users.map((u) => [String(u._id), u.email]));
}

export async function listTransactions(query: AdminTransactionsQuery) {
  const { type, userId, page, limit } = query;
  const filter: Record<string, unknown> = {};
  if (type !== 'all') filter.type = type;
  if (userId) filter.userId = userId;
  const [rows, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);
  const emails = await emailMap(rows.map((t) => t.userId));
  const items: AdminTransactionRow[] = rows.map((t) => ({
    id: t.id as string,
    user: { id: String(t.userId), email: emails.get(String(t.userId)) ?? '—' },
    type: t.type,
    amountMicro: t.amountMicro,
    balanceBeforeMicro: t.balanceBeforeMicro ?? t.balanceAfterMicro - t.amountMicro,
    balanceAfterMicro: t.balanceAfterMicro,
    description: t.description,
    createdAt: (t.get('createdAt') as Date).toISOString(),
  }));
  return { items, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function depositRow(d: DepositDoc, email: string): AdminDepositRow {
  return {
    id: d.id as string,
    user: { id: String(d.userId), email },
    method: d.method,
    amountMicro: d.amountMicro,
    status: d.status,
    createdAt: (d.get('createdAt') as Date).toISOString(),
    confirmedAt: d.confirmedAt ? d.confirmedAt.toISOString() : null,
  };
}

export async function listDeposits(query: AdminDepositsQuery) {
  const { status, page, limit } = query;
  const filter: Record<string, unknown> = {};
  if (status !== 'all') filter.status = status;
  const [rows, total] = await Promise.all([
    Deposit.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Deposit.countDocuments(filter),
  ]);
  const emails = await emailMap(rows.map((d) => d.userId));
  const items = rows.map((d) => depositRow(d, emails.get(String(d.userId)) ?? '—'));
  return { items, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function updateDepositStatus(
  id: string,
  status: 'confirmed' | 'failed',
): Promise<AdminDepositRow> {
  const deposit = await Deposit.findById(id);
  if (!deposit) throw notFound('Deposit not found');
  if (deposit.status !== 'pending') throw conflict(`Deposit is already ${deposit.status}`);

  if (status === 'confirmed') {
    await confirmDeposit(deposit);
  } else {
    deposit.status = 'failed';
    await deposit.save();
  }
  const fresh = await Deposit.findById(deposit._id);
  const email = (await User.findById(fresh!.userId, { email: 1 }))?.email ?? '—';
  return depositRow(fresh!, email);
}
