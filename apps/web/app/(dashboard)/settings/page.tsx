'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/ui/section-title';
import { LoadingRow } from '@/components/ui/spinner';
import { CopyButton } from '@/components/ui/copy-button';
import { LockIcon, CheckCircleIcon } from '@/components/ui/icons';
import { inputClass } from '@/components/ui/field';
import { ApiKeys } from '@/components/dashboard/api-keys';
import { Webhook } from '@/components/dashboard/webhook';
import { TwoFactor } from '@/components/dashboard/two-factor';
import { ChangePassword } from '@/components/dashboard/change-password';
import { cn } from '@/lib/cn';
import { formatBalanceUsd } from '@/lib/format';
import { useMe, useOrderStats } from '@/lib/hooks';

export default function SettingsPage() {
  const me = useMe();
  const stats = useOrderStats();
  if (me.isLoading || !me.data) return <LoadingRow />;
  const u = me.data.user;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Account</h1>
        <Link href="/dashboard" className="text-sm text-accent">
          ← Dashboard
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-faint">Member since</div>
          <div className="mt-1.5 font-display text-lg font-semibold">
            {new Date(u.createdAt).toLocaleDateString('en', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-faint">Total orders</div>
          <div className="mt-1.5 font-display text-lg font-semibold">
            {stats.data ? stats.data.totalOrders.toLocaleString() : '—'}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-faint">Balance</div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-success">
            {formatBalanceUsd(u.balanceMicro)}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <SectionTitle>Profile</SectionTitle>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-faint">Username</div>
            <div className="relative mt-1.5">
              <LockIcon />
              <input readOnly value={u.username} className={cn(inputClass, 'pl-9')} />
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-faint">Email</div>
            <div className="relative mt-1.5">
              <LockIcon />
              <input readOnly value={u.email} className={cn(inputClass, 'pl-9 pr-10')} />
              {u.isVerified ? (
                <span
                  title="Verified"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-success"
                >
                  <CheckCircleIcon />
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Affiliate code</SectionTitle>
        <div className="mt-3 flex items-center gap-2">
          <span className="font-mono">{u.affiliateCode}</span>
          <CopyButton value={u.affiliateCode} />
        </div>
        <Link href="/affiliate" className="mt-3 inline-block text-sm text-accent">
          Manage affiliate →
        </Link>
      </Card>

      <ChangePassword />

      <TwoFactor />

      <ApiKeys />

      <Webhook />
    </div>
  );
}
