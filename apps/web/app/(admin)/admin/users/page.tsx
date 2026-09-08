'use client';

import { useState } from 'react';
import type { AdminUserView } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { Field, TextInput } from '@/components/ui/field';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatApproxUsd, formatShortDateTime, formatUsd, parseUsd } from '@/lib/format';
import { ApiError } from '@/lib/api';
import {
  useAdjustBalance,
  useAdminUser,
  useAdminUsers,
  useUpdateUser,
} from '@/lib/admin-hooks';

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
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
                  onClick={() => setOpenId(u.id)}
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

      <Modal open={!!openId} onClose={() => setOpenId(null)} title="User detail" size="lg">
        {openId ? <UserDetail id={openId} onClose={() => setOpenId(null)} /> : null}
      </Modal>
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

function UserDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useAdminUser(id);
  const updateUser = useUpdateUser();
  const adjust = useAdjustBalance();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  if (isLoading || !data) return <LoadingRow />;
  const u = data as unknown as AdminUserView & {
    affiliateCode: string;
    recentOrders: { id: string; status: string; service: string; country: string; priceMicro: number; createdAt: string }[];
    recentTransactions: { id: string; type: string; amountMicro: number; description: string; createdAt: string }[];
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-semibold">{u.username}</span>
          {u.isVerified ? <Badge tone="success">verified</Badge> : <Badge tone="warning">unverified</Badge>}
        </div>
        <div className="text-sm text-muted">{u.email}</div>
        <div className="mt-1 font-mono text-sm text-success">{formatApproxUsd(u.balanceMicro)}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={updateUser.isPending}
          onClick={() => updateUser.mutate({ id, body: { role: u.role === 'admin' ? 'user' : 'admin' } })}
        >
          {u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={updateUser.isPending}
          onClick={() =>
            updateUser.mutate({ id, body: { status: u.status === 'suspended' ? 'active' : 'suspended' } })
          }
        >
          {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
        </Button>
      </div>
      {updateUser.isError ? (
        <p className="text-sm text-danger">
          {updateUser.error instanceof ApiError ? updateUser.error.message : 'Update failed'}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2/50 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          adjust.mutate(
            { id, amountMicro: parseUsd(amount), reason },
            { onSuccess: () => { setAmount(''); setReason(''); } },
          );
        }}
      >
        <div className="text-xs uppercase tracking-widest text-faint">Adjust balance</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label="Amount (USD, +/-)">
            <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-5 or 10" required />
          </Field>
          <Field label="Reason">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} />
          </Field>
        </div>
        {adjust.isError ? (
          <p className="text-sm text-danger">
            {adjust.error instanceof ApiError ? adjust.error.message : 'Adjustment failed'}
          </p>
        ) : null}
        <Button size="sm" type="submit" className="self-start" disabled={adjust.isPending}>
          Apply adjustment
        </Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-faint">Recent orders</div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {u.recentOrders.map((o) => (
              <li key={o.id} className="flex justify-between">
                <span className="truncate">{o.service} · {o.country}</span>
                <span className="text-muted">{formatUsd(o.priceMicro)}</span>
              </li>
            ))}
            {u.recentOrders.length === 0 ? <li className="text-faint">none</li> : null}
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-faint">Recent transactions</div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {u.recentTransactions.map((t) => (
              <li key={t.id} className="flex justify-between">
                <span className="truncate text-muted">{t.type}</span>
                <span className={t.amountMicro >= 0 ? 'text-success' : 'text-danger'}>
                  {formatUsd(t.amountMicro)}
                </span>
              </li>
            ))}
            {u.recentTransactions.length === 0 ? <li className="text-faint">none</li> : null}
          </ul>
        </div>
      </div>

      <Button variant="ghost" size="sm" className="self-end" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
