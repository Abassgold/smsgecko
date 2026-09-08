'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { AdminUserDetail } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, TextInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatShortDateTime, formatUsd, parseUsd } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useAdjustBalance, useAdminUser, useUpdateUser } from '@/lib/admin-hooks';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useAdminUser(id);

  if (isLoading) return <LoadingRow label="Loading user…" />;
  if (isError || !data) {
    return (
      <EmptyState
        title="User not found"
        description={error instanceof ApiError ? error.message : undefined}
      />
    );
  }

  const u = data as unknown as AdminUserDetail;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/users" className="text-sm text-accent">
        ← Back to users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold capitalize">{u.username}</h1>
            {u.role === 'admin' ? <Badge tone="accent">admin</Badge> : null}
            {u.status === 'suspended' ? (
              <Badge tone="danger">suspended</Badge>
            ) : (
              <Badge tone="success">active</Badge>
            )}
            {u.isVerified ? (
              <Badge tone="success">verified</Badge>
            ) : (
              <Badge tone="warning">unverified</Badge>
            )}
          </div>
          <div className="mt-1 text-sm text-muted">{u.email}</div>
          <div className="mt-1 text-xs text-faint">
            Joined {formatShortDateTime(u.createdAt)} · Affiliate code{' '}
            <span className="font-mono">{u.affiliateCode}</span> · {u.ordersCount} orders
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-faint">Balance</div>
          <div className="font-mono text-2xl font-semibold text-success">
            {formatUsd(u.balanceMicro)}
          </div>
        </div>
      </div>

      <RoleStatusActions user={u} />
      <AdjustBalance id={u.id} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-faint">Recent orders</div>
          {u.recentOrders.length === 0 ? (
            <p className="text-sm text-faint">No orders yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {u.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {o.service} · {o.country}
                  </span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Badge tone={o.status === 'completed' ? 'success' : 'muted'}>{o.status}</Badge>
                    <span className="font-mono text-muted">{formatUsd(o.priceMicro)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-faint">
            Recent transactions
          </div>
          {u.recentTransactions.length === 0 ? (
            <p className="text-sm text-faint">No transactions yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {u.recentTransactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-muted">{t.description || t.type}</span>
                  <span
                    className={`font-mono ${t.amountMicro >= 0 ? 'text-success' : 'text-danger'}`}
                  >
                    {t.amountMicro >= 0 ? '+' : ''}
                    {formatUsd(t.amountMicro)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

type Confirm = {
  body: { role?: 'user' | 'admin'; status?: 'active' | 'suspended' };
  title: string;
  message: string;
  cta: string;
};

function RoleStatusActions({ user }: { user: AdminUserDetail }) {
  const updateUser = useUpdateUser();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const run = (body: Confirm['body']) => updateUser.mutate({ id: user.id, body });

  const onRoleClick = () => {
    if (user.role === 'admin') {
      setConfirm({
        body: { role: 'user' },
        title: 'Demote to user',
        message: `Remove admin access from ${user.username}? They will lose access to the admin panel.`,
        cta: 'Demote',
      });
    } else {
      run({ role: 'admin' });
    }
  };

  const onStatusClick = () => {
    if (user.status !== 'suspended') {
      setConfirm({
        body: { status: 'suspended' },
        title: 'Suspend account',
        message: `Suspend ${user.username}? They will be blocked from signing in until the account is reactivated.`,
        cta: 'Suspend',
      });
    } else {
      run({ status: 'active' });
    }
  };

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <Button size="sm" variant="secondary" disabled={updateUser.isPending} onClick={onRoleClick}>
        {user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={updateUser.isPending}
        className={user.status === 'suspended' ? undefined : 'text-danger'}
        onClick={onStatusClick}
      >
        {user.status === 'suspended' ? 'Reactivate account' : 'Suspend account'}
      </Button>
      {updateUser.isError ? (
        <span className="text-sm text-danger">
          {updateUser.error instanceof ApiError ? updateUser.error.message : 'Update failed'}
        </span>
      ) : null}

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm?.title} size="sm">
        {confirm ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">{confirm.message}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="text-danger"
                disabled={updateUser.isPending}
                onClick={() => {
                  run(confirm.body);
                  setConfirm(null);
                }}
              >
                {confirm.cta}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

function AdjustBalance({ id }: { id: string }) {
  const adjust = useAdjustBalance();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const submit = (direction: 1 | -1) => {
    const micro = parseUsd(amount);
    if (!Number.isFinite(micro) || micro <= 0) return;
    adjust.mutate(
      { id, amountMicro: direction * Math.round(micro), reason },
      { onSuccess: () => { setAmount(''); setReason(''); } },
    );
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-xs uppercase tracking-widest text-faint">Adjust balance</div>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Amount (USD)">
          <TextInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            inputMode="decimal"
          />
        </Field>
        <Field label="Reason">
          <TextInput
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Why this adjustment?"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={adjust.isPending || !amount || !reason}
          onClick={() => submit(1)}
        >
          Credit
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="text-danger"
          disabled={adjust.isPending || !amount || !reason}
          onClick={() => submit(-1)}
        >
          Debit
        </Button>
        {adjust.isError ? (
          <span className="text-sm text-danger">
            {adjust.error instanceof ApiError ? adjust.error.message : 'Adjustment failed'}
          </span>
        ) : null}
        {adjust.isSuccess ? <span className="text-sm text-success">Balance updated.</span> : null}
      </div>
    </Card>
  );
}
