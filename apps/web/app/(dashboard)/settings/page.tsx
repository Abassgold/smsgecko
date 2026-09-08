'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { LoadingRow } from '@/components/ui/spinner';
import { CopyButton } from '@/components/ui/copy-button';
import { ApiKeys } from '@/components/dashboard/api-keys';
import { formatApproxUsd } from '@/lib/format';
import { useMe } from '@/lib/hooks';

export default function SettingsPage() {
  const me = useMe();
  if (me.isLoading || !me.data) return <LoadingRow />;
  const u = me.data.user;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <Link href="/dashboard" className="text-sm text-accent">
          ← Dashboard
        </Link>
      </div>

      <Card className="p-6">
        <h3 className="font-display text-sm font-semibold">Profile</h3>
        <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-3 text-sm">
          <dt className="text-faint">Username</dt>
          <dd>{u.username}</dd>
          <dt className="text-faint">Email</dt>
          <dd>{u.email}</dd>
          <dt className="text-faint">Balance</dt>
          <dd className="font-mono text-success">{formatApproxUsd(u.balanceMicro)}</dd>
          <dt className="text-faint">Member since</dt>
          <dd>{new Date(u.createdAt).toLocaleDateString('en')}</dd>
        </dl>
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-sm font-semibold">Affiliate code</h3>
        <div className="mt-3 flex items-center gap-2">
          <span className="font-mono">{u.affiliateCode}</span>
          <CopyButton value={u.affiliateCode} />
        </div>
        <Link href="/affiliate" className="mt-3 inline-block text-sm text-accent">
          Manage affiliate →
        </Link>
      </Card>

      <ApiKeys />
    </div>
  );
}
