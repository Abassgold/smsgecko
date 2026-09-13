'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatBalanceUsd, formatShortDateTime, formatSignedUsd } from '@/lib/format';
import { useAdminTransactions } from '@/lib/admin-hooks';

/** Paginated transactions table — the full /admin/finance listing, and
 * (passing `userId`) the same table scoped to one user, with the
 * now-redundant User column dropped. */
export function TransactionsTable({ userId }: { userId?: string }) {
  const [page, setPage] = useState(1);
  const txns = useAdminTransactions({ userId, page });
  const rows = txns.data?.items ?? [];

  return (
    <Card className="overflow-x-auto">
      {txns.isLoading ? (
        <LoadingRow />
      ) : rows.length === 0 ? (
        <EmptyState title="No transactions" />
      ) : (
        <table className={`w-full text-sm ${userId ? 'min-w-[760px]' : 'min-w-[980px]'}`}>
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
              <th className="px-4 py-3 font-medium">Date</th>
              {userId ? null : <th className="px-4 py-3 font-medium">User</th>}
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-right font-medium">Balance (before → after)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-muted">{formatShortDateTime(t.createdAt)}</td>
                {userId ? null : (
                  <td className="px-4 py-3 text-xs text-muted">{t.user.email}</td>
                )}
                <td className="px-4 py-3"><Badge tone="default">{t.type}</Badge></td>
                <td className="px-4 py-3 text-muted">{t.description}</td>
                <td className={`px-4 py-3 text-right font-mono ${t.amountMicro >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatSignedUsd(t.amountMicro)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                  {formatBalanceUsd(t.balanceBeforeMicro)} <span className="text-faint">→</span>{' '}
                  {formatBalanceUsd(t.balanceAfterMicro)}
                </td>
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

export function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span>Page {page} of {total}</span>
      <Button variant="secondary" size="sm" disabled={page >= total} onClick={() => onChange(page + 1)}>Next</Button>
    </div>
  );
}
