import type { OrderStatsResponse } from '@smsgecko/shared';
import { Order } from '../../models/Order.js';
import { Transaction } from '../../models/Transaction.js';
import type { UserDoc } from '../../models/User.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getOrderStats(user: UserDoc): Promise<OrderStatsResponse> {
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  windowStart.setUTCDate(windowStart.getUTCDate() - (WINDOW_DAYS - 1));

  const [byStatus, ordersByDay, spendByDay] = await Promise.all([
    Order.aggregate<{ _id: string; count: number }>([
      { $match: { userId: user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate<{ _id: string; count: number }>([
      { $match: { userId: user._id, createdAt: { $gte: windowStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate<{ _id: string; spend: number }>([
      { $match: { userId: user._id, type: 'order_payment', createdAt: { $gte: windowStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          spend: { $sum: { $abs: '$amountMicro' } },
        },
      },
    ]),
  ]);

  const counts = new Map(byStatus.map((r) => [r._id, r.count]));
  const totalOrders = [...counts.values()].reduce((a, b) => a + b, 0);
  const activeOrders = counts.get('waiting') ?? 0;
  const completedOrders = counts.get('completed') ?? 0;
  const resolved = totalOrders - activeOrders;
  const successRate = resolved > 0 ? completedOrders / resolved : 0;

  const ordersMap = new Map(ordersByDay.map((r) => [r._id, r.count]));
  const spendMap = new Map(spendByDay.map((r) => [r._id, r.spend]));

  const series: OrderStatsResponse['series'] = [];
  let spend30dMicro = 0;
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const date = dayKey(new Date(windowStart.getTime() + i * DAY_MS));
    const spendMicro = spendMap.get(date) ?? 0;
    spend30dMicro += spendMicro;
    series.push({ date, orders: ordersMap.get(date) ?? 0, spendMicro });
  }

  return {
    balanceMicro: user.balanceMicro,
    totalOrders,
    activeOrders,
    completedOrders,
    successRate: Math.round(successRate * 10000) / 10000,
    spend30dMicro,
    series,
  };
}
