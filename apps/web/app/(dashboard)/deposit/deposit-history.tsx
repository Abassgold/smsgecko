'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/ui/section-title';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';
import { formatShortDateTime, formatUsd } from '@/lib/format';
import { useDeposits, type DepositCounts } from '@/lib/hooks';
import { depositMethodInfo } from './methods';

const STATUS_TONE = {
  confirmed: 'success',
  failed: 'danger',
  pending: 'warning',
  expired: 'muted',
} as const;

const TABS: { key: keyof DepositCounts; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'failed', label: 'Failed' },
  { key: 'expired', label: 'Expired' },
];

export function DepositHistory() {
  const [status, setStatus] = useState<keyof DepositCounts>('all');
  const [page, setPage] = useState(1);
  const deposits = useDeposits(status, page);
  const rows = deposits.data?.items ?? [];
  const counts = deposits.data?.counts;

  const selectTab = (key: keyof DepositCounts) => {
    setStatus(key);
    setPage(1);
  };

  return (
    <Card className="p-6">
      <SectionTitle>Deposit History</SectionTitle>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition',
              status === t.key
                ? 'border-[var(--accent-ring)] bg-accent-soft/40 text-text'
                : 'border-border bg-surface-2 text-muted hover:text-text',
            )}
          >
            {t.label}
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] text-faint">
              {counts ? counts[t.key] : '—'}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        {deposits.isLoading ? (
          <LoadingRow />
        ) : rows.length === 0 ? (
          <EmptyState title="No deposits" />
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-3 py-3 font-medium">ID</th>
                <th className="px-3 py-3 font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Method</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-3 font-mono text-xs text-faint">#{d.id.slice(-8)}</td>
                  <td className="px-3 py-3 font-mono">{formatUsd(d.amountMicro)}</td>
                  <td className="px-3 py-3 text-muted">{depositMethodInfo(d.method)?.label ?? d.method}</td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? 'default'}>
                      {d.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-muted">
                    {formatShortDateTime(d.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deposits.data && deposits.data.totalPages > 1 ? (
        <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-sm text-muted">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {deposits.data.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= deposits.data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
