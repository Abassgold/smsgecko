'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatShortDateTime, formatSignedUsd, formatUsd } from '@/lib/format';
import { useAdminDeposits, useAdminTransactions, useUpdateDeposit } from '@/lib/admin-hooks';

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

function TransactionsTable() {
  const [page, setPage] = useState(1);
  const txns = useAdminTransactions({ page });
  const rows = (txns.data?.items ?? []) as Array<{
    id: string;
    user: { email: string };
    type: string;
    amountMicro: number;
    balanceAfterMicro: number;
    description: string;
    createdAt: string;
  }>;

  return (
    <Card className="overflow-x-auto">
      {txns.isLoading ? (
        <LoadingRow />
      ) : rows.length === 0 ? (
        <EmptyState title="No transactions" />
      ) : (
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-right font-medium">Balance after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-muted">{formatShortDateTime(t.createdAt)}</td>
                <td className="px-4 py-3 text-xs text-muted">{t.user.email}</td>
                <td className="px-4 py-3"><Badge tone="default">{t.type}</Badge></td>
                <td className="px-4 py-3 text-muted">{t.description}</td>
                <td className={`px-4 py-3 text-right font-mono ${t.amountMicro >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatSignedUsd(t.amountMicro)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted">{formatUsd(t.balanceAfterMicro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {txns.data && txns.data.totalPages > 1 ? (
        <Pager page={page} total={txns.data.totalPages} onChange={setPage} />
      ) : null}
    </Card>
  );
}

function DepositsTable() {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const deposits = useAdminDeposits({ status, page });
  const update = useUpdateDeposit();
  const rows = (deposits.data?.items ?? []) as Array<{
    id: string;
    user: { email: string };
    method: string;
    amountMicro: number;
    status: string;
    createdAt: string;
  }>;

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

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span>Page {page} of {total}</span>
      <Button variant="secondary" size="sm" disabled={page >= total} onClick={() => onChange(page + 1)}>Next</Button>
    </div>
  );
}
