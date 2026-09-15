'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatUsd } from '@/lib/format';
import { useConfirmDeposit, useDeposit } from '@/lib/hooks';
import { depositMethodInfo } from '../../methods';

const STATUS_TONE = {
  confirmed: 'success',
  failed: 'danger',
  pending: 'warning',
  expired: 'muted',
} as const;

/** mm:ss remaining until `expiresAt`, ticking every second; null once past. */
function useCountdown(expiresAt: string | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DepositCheckoutClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const deposit = useDeposit(params.id, status === null || status === 'pending');
  const confirm = useConfirmDeposit();

  useEffect(() => {
    if (deposit.data) setStatus(deposit.data.status);
  }, [deposit.data]);
  const countdown = useCountdown(deposit.data?.status === 'pending' ? deposit.data.expiresAt : undefined);

  if (deposit.isLoading) {
    return (
      <div className="mx-auto max-w-lg">
        <LoadingRow />
      </div>
    );
  }

  if (!deposit.data) {
    return (
      <div className="mx-auto max-w-lg">
        <EmptyState
          title="Deposit not found"
          description="This checkout link is invalid or belongs to another account."
          action={
            <Link href="/deposit" className="text-sm text-accent">
              ← Back to Deposit
            </Link>
          }
        />
      </div>
    );
  }

  const d = deposit.data;
  const info = depositMethodInfo(d.method);
  const simulate = () => {
    confirm.mutate(d.id, {
      onSuccess: () => router.push('/deposit?checkout=success&provider=mock'),
    });
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/deposit" className="text-sm text-accent">
          ← Deposit
        </Link>
        <Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? 'default'}>{d.status}</Badge>
      </div>

      <Card className="p-7">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            $
          </span>
          <h1 className="font-display text-lg font-semibold">Complete Payment</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
          This is SMSGecko&apos;s own demo checkout — no real payment happens here, in place of{' '}
          {info?.label ?? d.method}&apos;s actual page.
        </p>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-[var(--accent-ring)]/30 bg-accent-soft/40 px-5 py-4">
          <span className="text-xs uppercase tracking-widest text-faint">Amount to pay</span>
          <span className="font-mono text-lg font-semibold text-accent">
            {formatUsd(d.amountMicro)}
          </span>
        </div>

        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted">Deposit #</dt>
            <dd className="font-mono text-xs">#{d.id.slice(-8)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Method</dt>
            <dd>{info?.label ?? d.method}</dd>
          </div>
          {d.status === 'pending' && countdown ? (
            <div className="flex items-center justify-between">
              <dt className="text-muted">Expires in</dt>
              <dd className="font-mono text-warning">{countdown}</dd>
            </div>
          ) : null}
        </dl>

        {d.status === 'pending' ? (
          d.payAddress ? (
            <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
              <div className="text-xs uppercase tracking-widest text-faint">Send USDT to</div>
              <div className="mt-2 flex items-center gap-2">
                <code className="truncate rounded-lg bg-bg px-2 py-1.5 font-mono text-xs">
                  {d.payAddress}
                </code>
                <CopyButton value={d.payAddress} />
              </div>
            </div>
          ) : null
        ) : null}

        {d.status === 'pending' ? (
          <Button className="mt-5 w-full" onClick={simulate} disabled={confirm.isPending}>
            {confirm.isPending ? 'Processing…' : 'Simulate Payment'}
          </Button>
        ) : d.status === 'confirmed' ? (
          <div className="mt-5 rounded-xl border border-[rgba(70,177,123,0.3)] bg-[rgba(70,177,123,0.1)] p-4 text-sm text-success">
            Payment confirmed — balance updated.
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted">
            This deposit is {d.status} — start a new one from the Deposit page.
          </div>
        )}
      </Card>
    </div>
  );
}
