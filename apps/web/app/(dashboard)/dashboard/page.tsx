'use client';

import { StatTile } from '@/components/ui/stat';
import { LoadingRow } from '@/components/ui/spinner';
import { OrderCharts } from '@/components/dashboard/charts';
import { NewOrder } from '@/components/dashboard/new-order';
import { formatBalanceUsd } from '@/lib/format';
import { useMe, useOrderStats } from '@/lib/hooks';

export default function DashboardPage() {
  const me = useMe();
  const stats = useOrderStats();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-2xl font-bold">
        Welcome back,{' '}
        <span className="text-gradient">{me.data?.user.username ?? '…'}</span> 👋
      </h1>

      {stats.isLoading || !stats.data ? (
        <LoadingRow />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Balance"
              value={formatBalanceUsd(stats.data.balanceMicro)}
              accent="success"
              icon={<span>▦</span>}
            />
            <StatTile label="Orders" value={stats.data.totalOrders} icon={<span>▤</span>} />
            <StatTile
              label="Active"
              value={stats.data.activeOrders}
              accent="accent"
              icon={<span>◔</span>}
            />
            <StatTile
              label="Success"
              value={`${Math.round(stats.data.successRate * 100)}%`}
              accent="success"
              icon={<span>✓</span>}
            />
          </div>

          <OrderCharts series={stats.data.series} />
        </>
      )}

      <NewOrder />
    </div>
  );
}
