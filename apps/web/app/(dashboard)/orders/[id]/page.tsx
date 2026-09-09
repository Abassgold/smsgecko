'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner, LoadingRow } from '@/components/ui/spinner';
import { CopyButton } from '@/components/ui/copy-button';
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge';
import { formatCountdown, formatShortDateTime, formatUsd } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useCancelOrder, useOrder, useReactivateOrder, useResendOrder } from '@/lib/hooks';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const order = useOrder(id, true);
  const cancel = useCancelOrder();
  const resend = useResendOrder();
  const reactivate = useReactivateOrder();
  const qc = useQueryClient();
  const settledRef = useRef(false);

  // Post-purchase cancel lock — tick it down locally between the 2.5s polls.
  const [cancelLock, setCancelLock] = useState(0);
  const serverLock = order.data?.cancelLockSeconds ?? 0;
  useEffect(() => {
    setCancelLock(serverLock);
    if (serverLock <= 0) return;
    const t = setInterval(() => setCancelLock((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [serverLock]);

  const status = order.data?.status;
  useEffect(() => {
    if (!status || status === 'waiting' || settledRef.current) return;
    settledRef.current = true;
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['order-stats'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  }, [status, qc]);

  if (order.isLoading) return <LoadingRow label="Loading order…" />;
  if (order.isError || !order.data) {
    return (
      <Card className="p-8 text-center text-sm text-muted">
        Order not found.{' '}
        <Link href="/orders" className="text-accent">
          Back to orders
        </Link>
      </Card>
    );
  }

  const o = order.data;
  const waiting = o.status === 'waiting';
  const refunded = o.status === 'canceled' || o.status === 'expired';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/orders" className="text-sm text-accent">
          ← All orders
        </Link>
        <span className="font-mono text-xs text-faint">#{o.id.slice(-8)}</span>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-display text-lg font-semibold">{o.service.name}</div>
            <div className="text-sm text-muted">
              {o.country.flagEmoji} {o.country.name} · {formatUsd(o.priceMicro)}
            </div>
          </div>
          <OrderStatusBadge status={o.status} />
        </div>

        <div className="mt-6 rounded-xl border border-border bg-surface-2 p-4">
          <div className="text-xs uppercase tracking-widest text-faint">Number</div>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-xl">{o.phoneNumber}</span>
            <CopyButton value={o.phoneNumber} />
          </div>
        </div>

        {waiting ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
            <Spinner className="text-accent" />
            <div className="text-sm text-muted">Waiting for the verification SMS…</div>
            <div className="font-mono text-2xl">{formatCountdown(o.secondsLeft)}</div>
            <div className="text-xs text-faint">Auto-refund when the timer runs out.</div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={resend.isPending}
                onClick={() => resend.mutate(o.id)}
              >
                {resend.isPending ? 'Requesting…' : 'Request another code'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={cancel.isPending || cancelLock > 0}
                onClick={() => cancel.mutate(o.id)}
              >
                {cancel.isPending
                  ? 'Canceling…'
                  : cancelLock > 0
                    ? `Cancel available in ${formatCountdown(cancelLock)}`
                    : 'Cancel & refund'}
              </Button>
            </div>
            {resend.isError ? (
              <p className="text-xs text-danger">
                {resend.error instanceof ApiError ? resend.error.message : 'Request failed'}
              </p>
            ) : null}
            {cancelLock > 0 ? (
              <p className="text-xs text-faint">
                New numbers are locked for a few minutes after purchase. You&apos;ll be able to
                cancel for a full refund in {formatCountdown(cancelLock)}.
              </p>
            ) : null}
            {cancel.isError ? (
              <p className="text-xs text-danger">
                {cancel.error instanceof ApiError ? cancel.error.message : 'Cancel failed'}
              </p>
            ) : null}
          </div>
        ) : null}

        {o.status === 'completed' && o.otpCode ? (
          <div className="mt-6 rounded-xl border border-[var(--accent-ring)]/40 bg-accent-soft p-5 text-center">
            <div className="text-xs uppercase tracking-widest text-faint">Verification code</div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="font-mono text-3xl tracking-[0.3em] text-text">{o.otpCode}</span>
              <CopyButton value={o.otpCode} />
            </div>
            <div className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                disabled={reactivate.isPending}
                onClick={() => reactivate.mutate(o.id)}
              >
                {reactivate.isPending ? 'Reactivating…' : 'Get another code on this number'}
              </Button>
              {reactivate.isError ? (
                <p className="mt-1 text-xs text-danger">
                  {reactivate.error instanceof ApiError
                    ? reactivate.error.message
                    : 'Reactivation failed'}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {refunded ? (
          <div className="mt-6 rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted">
            No code was received before the window closed — the full amount was refunded to your
            balance.
          </div>
        ) : null}
      </Card>

      {o.messages.length > 0 ? (
        <Card className="p-6">
          <h3 className="font-display text-sm font-semibold">Messages</h3>
          <div className="mt-4 flex flex-col gap-3">
            {o.messages.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-surface-2 p-4">
                <div className="flex items-center justify-between text-xs text-faint">
                  <span>{m.sender}</span>
                  <span>{formatShortDateTime(m.receivedAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text/90">{m.text}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
