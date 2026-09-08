import { Router } from 'express';
import { z } from 'zod';
import {
  adjustBalanceBody,
  adminUsersQuery,
  objectId,
  updateUserBody,
} from '@smsgecko/shared';
import { User, type UserDoc } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { Transaction } from '../../models/Transaction.js';
import { credit, debit } from '../../lib/ledger.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';

const idParams = z.object({ id: objectId });

async function toRow(u: UserDoc) {
  return {
    id: u.id as string,
    email: u.email,
    username: u.username,
    role: u.role,
    status: u.status,
    balanceMicro: u.balanceMicro,
    ordersCount: await Order.countDocuments({ userId: u._id }),
    createdAt: (u.get('createdAt') as Date).toISOString(),
  };
}

export const adminUserRouter = Router();

adminUserRouter.get('/', async (req, res) => {
  const { q, status, role, page, limit } = parse(adminUsersQuery, req.query);
  const filter: Record<string, unknown> = {};
  if (status !== 'all') filter.status = status;
  if (role !== 'all') filter.role = role;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: rx }, { username: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({
    items: await Promise.all(items.map(toRow)),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

adminUserRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const user = await User.findById(id);
  if (!user) throw notFound('User not found');
  const [orders, txns] = await Promise.all([
    Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10),
    Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10),
  ]);
  res.json({
    ...(await toRow(user)),
    affiliateCode: user.affiliateCode,
    recentOrders: orders.map((o) => ({
      id: o.id as string,
      status: o.status,
      service: o.serviceName,
      country: o.countryName,
      priceMicro: o.priceMicro,
      createdAt: (o.get('createdAt') as Date).toISOString(),
    })),
    recentTransactions: txns.map((t) => ({
      id: t.id as string,
      type: t.type,
      amountMicro: t.amountMicro,
      description: t.description,
      createdAt: (t.get('createdAt') as Date).toISOString(),
    })),
  });
});

adminUserRouter.patch('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateUserBody, req.body);
  const user = await User.findById(id);
  if (!user) throw notFound('User not found');
  if (body.role !== undefined) {
    if (user.id === req.authUser!.id && body.role !== 'admin') {
      throw badRequest('You cannot remove your own admin role');
    }
    user.role = body.role;
  }
  if (body.status !== undefined) {
    if (user.id === req.authUser!.id && body.status === 'suspended') {
      throw badRequest('You cannot suspend yourself');
    }
    user.status = body.status;
  }
  await user.save();
  res.json(await toRow(user));
});

adminUserRouter.post('/:id/adjust-balance', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { amountMicro, reason } = parse(adjustBalanceBody, req.body);
  const user = await User.findById(id);
  if (!user) throw notFound('User not found');
  const description = `Admin adjustment — ${reason}`;
  if (amountMicro > 0) {
    await credit(user._id, amountMicro, { type: 'adjustment', description });
  } else {
    await debit(user._id, -amountMicro, { type: 'adjustment', description });
  }
  const fresh = await User.findById(user._id);
  res.json(await toRow(fresh!));
});
