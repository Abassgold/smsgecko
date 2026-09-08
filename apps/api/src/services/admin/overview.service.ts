import type { AdminOverview } from '@smsgecko/shared';
import { User } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { Transaction } from '../../models/Transaction.js';
import { ProviderConfig } from '../../models/ProviderConfig.js';

const DAY = 86_400_000;

export async function getOverview(): Promise<AdminOverview> {
  const now = new Date();
  const since30 = new Date(now.getTime() - 29 * DAY);
  const windowStart = new Date(
    Date.UTC(since30.getUTCFullYear(), since30.getUTCMonth(), since30.getUTCDate()),
  );

  const [
    usersTotal,
    usersNew30d,
    ordersTotal,
    orders24h,
    orders7d,
    byStatusAgg,
    moneyAgg,
    providerCostAgg,
    ordersByDay,
    revenueByDay,
    spendByDay,
    providers,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ createdAt: { $gte: since30 } }),
    Order.countDocuments({}),
    Order.countDocuments({ createdAt: { $gte: new Date(now.getTime() - DAY) } }),
    Order.countDocuments({ createdAt: { $gte: new Date(now.getTime() - 7 * DAY) } }),
    Order.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Transaction.aggregate<{ _id: string; total: number }>([
      { $group: { _id: '$type', total: { $sum: '$amountMicro' } } },
    ]),
    Order.aggregate<{ total: number }>([
      { $match: { providerCostMicro: { $ne: null } } },
      { $group: { _id: null, total: { $sum: '$providerCostMicro' } } },
    ]),
    Order.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: windowStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
    ]),
    Transaction.aggregate<{ _id: string; total: number }>([
      { $match: { type: 'deposit', createdAt: { $gte: windowStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$amountMicro' } } },
    ]),
    Transaction.aggregate<{ _id: string; total: number }>([
      { $match: { type: 'order_payment', createdAt: { $gte: windowStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: { $abs: '$amountMicro' } } } },
    ]),
    ProviderConfig.find().sort({ priority: 1, createdAt: 1 }),
  ]);

  const ordersByStatus: Record<string, number> = {};
  for (const r of byStatusAgg) ordersByStatus[r._id] = r.n;
  const completed = ordersByStatus.completed ?? 0;
  const active = ordersByStatus.waiting ?? 0;
  const resolved = ordersTotal - active;

  const money = new Map(moneyAgg.map((r) => [r._id, r.total]));
  const revenueMicro = money.get('deposit') ?? 0;
  const spendMicro = Math.abs(money.get('order_payment') ?? 0);
  const refundMicro = money.get('refund') ?? 0;
  const providerCostMicro = providerCostAgg[0]?.total ?? 0;

  const ordersMap = new Map(ordersByDay.map((r) => [r._id, r.n]));
  const revMap = new Map(revenueByDay.map((r) => [r._id, r.total]));
  const spendMap = new Map(spendByDay.map((r) => [r._id, r.total]));
  const series = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(windowStart.getTime() + i * DAY).toISOString().slice(0, 10);
    return {
      date,
      orders: ordersMap.get(date) ?? 0,
      revenueMicro: revMap.get(date) ?? 0,
      spendMicro: spendMap.get(date) ?? 0,
    };
  });

  return {
    usersTotal,
    usersNew30d,
    ordersTotal,
    orders24h,
    orders7d,
    ordersByStatus,
    activeOrders: active,
    successRate: resolved > 0 ? Math.round((completed / resolved) * 10000) / 10000 : 0,
    revenueMicro,
    spendMicro,
    refundMicro,
    providerCostMicro,
    grossMarginMicro: spendMicro - providerCostMicro,
    series,
    providers: providers.map((p) => {
      const s = p.stats ?? {};
      const attempts = (s.rentSuccess ?? 0) + (s.rentError ?? 0) + (s.rentNoStock ?? 0);
      return {
        id: p.id as string,
        label: p.label,
        enabled: p.enabled,
        priority: p.priority,
        healthOk: p.healthOk ?? null,
        rentSuccess: s.rentSuccess ?? 0,
        rentError: s.rentError ?? 0,
        otpReceived: s.otpReceived ?? 0,
        successRate:
          attempts > 0 ? Math.round(((s.rentSuccess ?? 0) / attempts) * 10000) / 10000 : 0,
        lastUsedAt: s.lastUsedAt ? new Date(s.lastUsedAt).toISOString() : null,
      };
    }),
  };
}
