'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TransactionType } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { API_BASE } from '@/lib/api';
import { formatBalanceUsd, formatShortDateTime, formatSignedUsd } from '@/lib/format';
import { useTransactions, useWallet } from '@/lib/hooks';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'credits', label: 'Credits' },
  { value: 'debits', label: 'Debits' },
];

const TYPE_LABEL: Record<TransactionType, { label: string; tone: 'success' | 'danger' | 'default' }> = {
  deposit: { label: 'Deposit', tone: 'success' },
  refund: { label: 'Refund', tone: 'success' },
  order_payment: { label: 'Order', tone: 'danger' },
  affiliate_payout: { label: 'Affiliate', tone: 'success' },
  adjustment: { label: 'Adjustment', tone: 'default' },
};

export default function TransactionsPage() {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const wallet = useWallet();
  const txns = useTransactions(tab, page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Transactions</h1>
        <Link href="/dashboard" className="text-sm text-accent">
          ← Dashboard
        </Link>
      </div>

      <Card className="flex items-center justify-between p-5">
        <span className="text-xs uppercase tracking-widest text-faint">Available balance</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg text-success">
            {formatBalanceUsd(wallet.data?.balanceMicro ?? 0)}
          </span>
          <a
            href={`${API_BASE}/v1/transactions/export.csv`}
            className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-text"
          >
            Export CSV
          </a>
        </div>
      </Card>

      <Tabs
        items={TABS}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      />

      <Card className="overflow-hidden">
        {txns.isLoading ? (
          <LoadingRow />
        ) : !txns.data || txns.data.items.length === 0 ? (
          <EmptyState title="No transactions" description="Deposits and order activity show up here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {txns.data.items.map((t) => {
                  const meta = TYPE_LABEL[t.type];
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 text-muted">{formatShortDateTime(t.createdAt)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">{t.description}</td>
                      <td
                        className={`px-5 py-3 text-right font-mono ${
                          t.amountMicro >= 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {formatSignedUsd(t.amountMicro)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-muted">
                        {formatBalanceUsd(t.balanceBeforeMicro)}{' '}
                        <span className="text-faint">→</span>{' '}
                        {formatBalanceUsd(t.balanceAfterMicro)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {txns.data && txns.data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {txns.data.page} of {txns.data.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= txns.data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
