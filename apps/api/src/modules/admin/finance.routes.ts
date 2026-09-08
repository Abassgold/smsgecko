import { Router } from 'express';
import { z } from 'zod';
import {
  adminDepositsQuery,
  adminTransactionsQuery,
  objectId,
  updateDepositBody,
} from '@smsgecko/shared';
import { Transaction } from '../../models/Transaction.js';
import { Deposit } from '../../models/Deposit.js';
import { User } from '../../models/User.js';
import { confirmDeposit } from '../deposits/deposits.service.js';
import { conflict, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';

const idParams = z.object({ id: objectId });

async function emailMap(userIds: unknown[]): Promise<Map<string, string>> {
  const users = await User.find({ _id: { $in: userIds } }, { email: 1 });
  return new Map(users.map((u) => [String(u._id), u.email]));
}

export const adminFinanceRouter = Router();

adminFinanceRouter.get('/transactions', async (req, res) => {
  const { type, userId, page, limit } = parse(adminTransactionsQuery, req.query);
  const filter: Record<string, unknown> = {};
  if (type !== 'all') filter.type = type;
  if (userId) filter.userId = userId;
  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);
  const emails = await emailMap(items.map((t) => t.userId));
  res.json({
    items: items.map((t) => ({
      id: t.id as string,
      user: { id: String(t.userId), email: emails.get(String(t.userId)) ?? '—' },
      type: t.type,
      amountMicro: t.amountMicro,
      balanceAfterMicro: t.balanceAfterMicro,
      description: t.description,
      createdAt: (t.get('createdAt') as Date).toISOString(),
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

adminFinanceRouter.get('/deposits', async (req, res) => {
  const { status, page, limit } = parse(adminDepositsQuery, req.query);
  const filter: Record<string, unknown> = {};
  if (status !== 'all') filter.status = status;
  const [items, total] = await Promise.all([
    Deposit.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Deposit.countDocuments(filter),
  ]);
  const emails = await emailMap(items.map((d) => d.userId));
  res.json({
    items: items.map((d) => ({
      id: d.id as string,
      user: { id: String(d.userId), email: emails.get(String(d.userId)) ?? '—' },
      method: d.method,
      amountMicro: d.amountMicro,
      status: d.status,
      createdAt: (d.get('createdAt') as Date).toISOString(),
      confirmedAt: d.confirmedAt ? d.confirmedAt.toISOString() : null,
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

adminFinanceRouter.patch('/deposits/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateDepositBody, req.body);
  const deposit = await Deposit.findById(id);
  if (!deposit) throw notFound('Deposit not found');
  if (deposit.status !== 'pending') throw conflict(`Deposit is already ${deposit.status}`);

  if (body.status === 'confirmed') {
    await confirmDeposit(deposit);
  } else {
    deposit.status = 'failed';
    await deposit.save();
  }
  const fresh = await Deposit.findById(deposit._id);
  const email = (await User.findById(fresh!.userId, { email: 1 }))?.email ?? '—';
  res.json({
    id: fresh!.id as string,
    user: { id: String(fresh!.userId), email },
    method: fresh!.method,
    amountMicro: fresh!.amountMicro,
    status: fresh!.status,
    createdAt: (fresh!.get('createdAt') as Date).toISOString(),
    confirmedAt: fresh!.confirmedAt ? fresh!.confirmedAt.toISOString() : null,
  });
});
