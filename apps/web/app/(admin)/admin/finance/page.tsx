'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { TransactionsTable, Pager } from '@/components/admin/transactions-table';
import { formatShortDateTime, formatUsd } from '@/lib/format';
import { useAdminDeposits, useUpdateDeposit } from '@/lib/admin-hooks';

export default function AdminFinancePage() {
  const [view, setView] = useState<'transactions' | 'deposits'>('transactions');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Finance</h1>
      <Tabs
        items={[
          { value: 'transactions', label: 'Transactions' },
          { value: 'deposits', label: 'Deposits' },
        ]}
        value={view}
        onChange={(v) => setView(v as 'transactions' | 'deposits')}
      />
      {view === 'transactions' ? <TransactionsTable /> : <DepositsTable />}
    </div>
  );
}

function DepositsTable() {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const deposits = useAdminDeposits({ status, page });
  const update = useUpdateDeposit();
  const rows = deposits.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'confirmed', label: 'Confirmed' },
          { value: 'failed', label: 'Failed' },
        ]}
        value={status}
        onChange={(v) => { setStatus(v); setPage(1); }}
      />
      <Card className="overflow-x-auto">
        {deposits.isLoading ? (
          <LoadingRow />
        ) : rows.length === 0 ? (
          <EmptyState title="No deposits" />
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted">{formatShortDateTime(d.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-muted">{d.user.email}</td>
                  <td className="px-4 py-3">{d.method}</td>
                  <td className="px-4 py-3 font-mono">{formatUsd(d.amountMicro)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={d.status === 'confirmed' ? 'success' : d.status === 'failed' ? 'danger' : 'warning'}>
                      {d.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {d.status === 'pending' ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" disabled={update.isPending}
                          onClick={() => update.mutate({ id: d.id, status: 'confirmed' })}>
                          Confirm
                        </Button>
                        <Button variant="ghost" size="sm" disabled={update.isPending}
                          onClick={() => update.mutate({ id: d.id, status: 'failed' })}>
                          Fail
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {deposits.data && deposits.data.totalPages > 1 ? (
          <Pager page={page} total={deposits.data.totalPages} onChange={setPage} />
        ) : null}
      </Card>
    </div>
  );
}
