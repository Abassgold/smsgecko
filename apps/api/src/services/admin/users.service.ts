import type { AdminUserDetail, AdminUserView } from '@smsgecko/shared';
import { User, type UserDoc } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { Transaction } from '../../models/Transaction.js';
import { credit, debit } from '../../lib/ledger.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { logAdminAction } from '../../lib/adminLog.js';
import { usdString } from '../v2.mapper.js';
import type { AdminUsersQuery } from '../../lib/validation/admin/users.schema.js';

export async function toRow(u: UserDoc): Promise<AdminUserView> {
  return {
    id: u.id as string,
    email: u.email,
    username: u.username,
    role: u.role,
    status: u.status,
    isVerified: u.isVerified,
    balanceMicro: u.balanceMicro,
    ordersCount: await Order.countDocuments({ userId: u._id }),
    createdAt: (u.get('createdAt') as Date).toISOString(),
  };
}

export async function listUsers(query: AdminUsersQuery) {
  const { q, status, role, page, limit } = query;
  const filter: Record<string, unknown> = {};
  if (status !== 'all') filter.status = status;
  if (role !== 'all') filter.role = role;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: rx }, { username: rx }];
  }
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  return {
    items: await Promise.all(users.map(toRow)),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getUserDetail(id: string): Promise<AdminUserDetail> {
  const user = await User.findById(id);
  if (!user) throw notFound('User not found');
  const [orders, txns] = await Promise.all([
    Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10),
    Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10),
  ]);
  return {
    ...(await toRow(user)),
    affiliateCode: user.affiliateCode,
    recentOrders: orders.map((o) => ({
      id: o.id as string,
      status: o.status,
      source: o.source,
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
  };
}

export interface UpdateUserInput {
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
}

export async function updateUser(
  id: string,
  body: UpdateUserInput,
  actingUserId: string,
): Promise<AdminUserView> {
  const user = await User.findById(id);
  if (!user) throw notFound('User not found');
  const changes: string[] = [];
  if (body.role !== undefined) {
    if (user.id === actingUserId && body.role !== 'admin') {
      throw badRequest('You cannot remove your own admin role');
    }
    if (body.role !== user.role) changes.push(`role: ${user.role} → ${body.role}`);
    user.role = body.role;
  }
  if (body.status !== undefined) {
    if (user.id === actingUserId && body.status === 'suspended') {
      throw badRequest('You cannot suspend yourself');
    }
    if (body.status !== user.status) changes.push(`status: ${user.status} → ${body.status}`);
    user.status = body.status;
  }
  await user.save();
  if (changes.length) {
    void logAdminAction(actingUserId, 'user_update', { type: 'user', id }, changes.join(', '));
  }
  return toRow(user);
}

export async function adjustBalance(
  id: string,
  amountMicro: number,
  reason: string,
  actingUserId: string,
): Promise<AdminUserView> {
  const user = await User.findById(id);
  if (!user) throw notFound('User not found');
  const description = `Admin adjustment — ${reason}`;
  if (amountMicro > 0) {
    await credit(user._id, amountMicro, { type: 'adjustment', description });
  } else {
    await debit(user._id, -amountMicro, { type: 'adjustment', description });
  }
  void logAdminAction(
    actingUserId,
    'balance_adjust',
    { type: 'user', id },
    `${amountMicro >= 0 ? '+' : '-'}${usdString(Math.abs(amountMicro))} — ${reason}`,
  );
  const fresh = await User.findById(user._id);
  return toRow(fresh!);
}
