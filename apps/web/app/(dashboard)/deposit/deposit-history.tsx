'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatShortDateTime, formatUsd } from '@/lib/format';
import { useDeposits } from '@/lib/hooks';
import { depositMethodInfo } from './methods';

const STATUS_TONE = {
  confirmed: 'success',
  failed: 'danger',
  pending: 'warning',
  expired: 'muted',
} as const;

export function DepositHistory() {
  const [page, setPage] = useState(1);
  const deposits = useDeposits(page);
  const rows = deposits.data?.items ?? [];

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-display text-sm font-semibold">Recent deposits</h3>

      {deposits.isLoading ? (
        <LoadingRow />
      ) : rows.length === 0 ? (
        <EmptyState title="No deposits yet" />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{depositMethodInfo(d.method)?.label ?? d.method}</div>
                <div className="text-xs text-faint">{formatShortDateTime(d.createdAt)}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-xs">{formatUsd(d.amountMicro)}</span>
                <Badge tone={STATUS_TONE[d.status] ?? 'default'}>{d.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deposits.data && deposits.data.totalPages > 1 ? (
        <div className="flex items-center justify-between pt-1 text-xs text-muted">
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
