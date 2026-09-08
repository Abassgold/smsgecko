'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge';
import { formatShortDateTime, formatUsd } from '@/lib/format';
import { useOrders } from '@/lib/hooks';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
];

export default function OrdersPage() {
  const router = useRouter();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const orders = useOrders(tab, page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Your Orders</h1>
        <Link href="/dashboard" className="text-sm text-accent">
          ← Dashboard
        </Link>
      </div>

      <Tabs
        items={TABS}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      />

      <Card className="overflow-hidden">
        {orders.isLoading ? (
          <LoadingRow />
        ) : !orders.data || orders.data.items.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Buy a number from the dashboard to see it here."
            action={<Button href="/dashboard">New order</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.items.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/orders/${o.id}`)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-accent">#{o.id.slice(-8)}</span>
                    </td>
                    <td className="px-5 py-3">{o.service.name}</td>
                    <td className="px-5 py-3 text-muted">
                      {o.country.flagEmoji} {o.country.name}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted">{o.phoneNumber}</td>
                    <td className="px-5 py-3">
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-3 font-mono">{formatUsd(o.priceMicro)}</td>
                    <td className="px-5 py-3 text-muted">{formatShortDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {orders.data && orders.data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {orders.data.page} of {orders.data.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= orders.data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
