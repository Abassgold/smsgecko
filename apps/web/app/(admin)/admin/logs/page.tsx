'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { TextInput } from '@/components/ui/field';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Pager } from '@/components/admin/transactions-table';
import { formatShortDateTime } from '@/lib/format';
import { useAdminLogs } from '@/lib/admin-hooks';

const TARGET_TYPES = [
  { value: '', label: 'All' },
  { value: 'user', label: 'Users' },
  { value: 'order', label: 'Orders' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'settings', label: 'Settings' },
];

export default function AdminLogsPage() {
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [page, setPage] = useState(1);
  const logs = useAdminLogs({ targetType, targetId, page });
  const rows = logs.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Audit log</h1>
      <p className="text-sm text-muted -mt-4">
        Every balance adjustment, suspension, role change, forced cancellation, settings edit,
        and deposit decision made from this panel — who did it and when.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          items={TARGET_TYPES}
          value={targetType}
          onChange={(v) => { setTargetType(v); setPage(1); }}
        />
        <TextInput
          placeholder="Target id…"
          value={targetId}
          onChange={(e) => { setTargetId(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
      </div>

      <Card className="overflow-x-auto">
        {logs.isLoading ? (
          <LoadingRow />
        ) : rows.length === 0 ? (
          <EmptyState title="No actions match" />
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted">{formatShortDateTime(a.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-muted">{a.admin.email}</td>
                  <td className="px-4 py-3">
                    <Badge tone="default">{a.action}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-faint">
                    {a.targetType}
                    {a.targetId ? ` #${a.targetId.slice(-8)}` : ''}
                  </td>
                  <td className="px-4 py-3 text-muted">{a.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {logs.data && logs.data.totalPages > 1 ? (
          <Pager page={page} total={logs.data.totalPages} onChange={setPage} />
        ) : null}
      </Card>
    </div>
  );
}
