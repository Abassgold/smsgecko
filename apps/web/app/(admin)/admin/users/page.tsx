'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { TextInput } from '@/components/ui/field';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatApproxUsd, formatShortDateTime } from '@/lib/format';
import { useAdminUsers } from '@/lib/admin-hooks';

export default function AdminUsersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const users = useAdminUsers({ q, status, page });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Users</h1>

      <div className="flex flex-wrap items-center gap-3">
        <TextInput
          placeholder="Search email or username…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Tabs
          items={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>

      <Card className="overflow-x-auto">
        {users.isLoading ? (
          <LoadingRow />
        ) : !users.data || users.data.items.length === 0 ? (
          <EmptyState title="No users match" />
        ) : (
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Verified</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Orders</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.username}</div>
                    <div className="text-xs text-faint">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? <Badge tone="accent">admin</Badge> : <span className="text-muted">user</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.status === 'suspended' ? <Badge tone="danger">suspended</Badge> : <Badge tone="success">active</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {u.isVerified ? <Badge tone="success">verified</Badge> : <Badge tone="warning">unverified</Badge>}
                  </td>
                  <td className="px-4 py-3 font-mono">{formatApproxUsd(u.balanceMicro)}</td>
                  <td className="px-4 py-3 font-mono text-muted">{u.ordersCount}</td>
                  <td className="px-4 py-3 text-muted">{formatShortDateTime(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {users.data && users.data.totalPages > 1 ? (
        <Pager page={page} totalPages={users.data.totalPages} onChange={setPage} />
      ) : null}
    </div>
  );
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between text-sm text-muted">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span>
        Page {page} of {totalPages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}
