'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { TextInput } from '@/components/ui/field';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge';
import { formatBalanceUsd, formatShortDateTime, formatUsd } from '@/lib/format';
import { useAdminOrders, useCancelAdminOrder, useRepollAdminOrder } from '@/lib/admin-hooks';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'expired', label: 'Expired' },
];

export default function AdminOrdersPage() {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const orders = useAdminOrders({ status, q, page });
  const cancel = useCancelAdminOrder();
  const repoll = useRepollAdminOrder();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Orders</h1>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs items={TABS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
        <TextInput
          placeholder="Phone or provider ref…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
      </div>

      <Card className="overflow-x-auto">
        {orders.isLoading ? (
          <LoadingRow />
        ) : !orders.data || orders.data.items.length === 0 ? (
          <EmptyState title="No orders match" />
        ) : (
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Service / Country</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Price / Cost</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {orders.data.items.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-accent">#{o.id.slice(-8)}</td>
                  <td className="px-4 py-3 text-xs text-muted">{o.user.email}</td>
                  <td className="px-4 py-3">
                    {o.service}
                    <div className="text-xs text-faint">
                      {o.countryFlagEmoji} {o.country} · {o.phoneNumber}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{o.providerLabel ?? o.provider}</td>
                  <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 font-mono">
                    {formatUsd(o.priceMicro)}
                    <div className="text-xs text-faint">
                      {o.providerCostMicro != null ? formatUsd(o.providerCostMicro) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {o.balanceBeforeMicro != null && o.balanceAfterMicro != null ? (
                      <span className="text-muted">
                        {formatBalanceUsd(o.balanceBeforeMicro)}{' '}
                        <span className="text-faint">→</span>{' '}
                        {formatBalanceUsd(o.balanceAfterMicro)}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatShortDateTime(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    {o.status === 'waiting' ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" disabled={repoll.isPending} onClick={() => repoll.mutate(o.id)}>
                          Re-poll
                        </Button>
                        <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(o.id)}>
                          Cancel
                        </Button>
                      </div>
                    ) : o.otpCode ? (
                      <span className="font-mono text-xs text-success">{o.otpCode}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {orders.data && orders.data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {orders.data.totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= orders.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
