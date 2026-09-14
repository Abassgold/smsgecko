'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { formatBalanceUsd } from '@/lib/format';
import { useWallet } from '@/lib/hooks';
import { DEPOSIT_METHOD_INFO, GROUP_LABEL, type DepositMethodInfo } from './methods';
import { DepositHistory } from './deposit-history';

const GROUPS: DepositMethodInfo['group'][] = ['fiat', 'crypto', 'dev'];

/** Returning from a hosted checkout (Stripe / Korapay / NowPayments /
 * Cryptomus): the balance update itself lands via webhook, possibly a few
 * seconds after the redirect, so poll the wallet briefly instead of
 * expecting it to already be updated on the first render back. */
function useReturnFromCheckout() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const outcome = params.get('checkout');
  const provider = params.get('provider');

  useEffect(() => {
    if (outcome !== 'success') return;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['deposits'] });
      if (ticks >= 6) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [outcome, qc]);

  return { outcome, provider };
}

export function DepositPicker() {
  const wallet = useWallet();
  const { outcome, provider } = useReturnFromCheckout();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Deposit</h1>
          <Link href="/dashboard" className="text-sm text-accent">
            ← Dashboard
          </Link>
        </div>

        <Card className="flex items-center justify-between border-[rgba(70,177,123,0.25)] p-5">
          <span className="text-xs uppercase tracking-widest text-faint">Available balance</span>
          <span className="font-mono text-lg text-success">
            {formatBalanceUsd(wallet.data?.balanceMicro ?? 0)}
          </span>
        </Card>

        {outcome === 'success' ? (
          <div className="rounded-xl border border-[rgba(70,177,123,0.3)] bg-[rgba(70,177,123,0.1)] p-4 text-sm text-success">
            Payment received{provider ? ` via ${provider}` : ''} — your balance updates as soon as
            it&apos;s confirmed.
          </div>
        ) : outcome === 'cancel' ? (
          <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted">
            Checkout was canceled — no charge was made.
          </div>
        ) : null}

        {GROUPS.map((group) => {
          const methods = DEPOSIT_METHOD_INFO.filter((m) => m.group === group);
          if (methods.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-faint">
                {GROUP_LABEL[group]}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {methods.map((m) => (
                  <Link
                    key={m.method}
                    href={`/deposit/${m.method}`}
                    className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-2 p-4 transition hover:border-[var(--accent-ring)] hover:bg-accent-soft/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-semibold">{m.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-faint">{m.fee}</span>
                    </div>
                    <span className="text-xs text-muted">{m.blurb}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="w-full lg:sticky lg:top-6 lg:w-80 lg:shrink-0">
        <DepositHistory />
      </div>
    </div>
  );
}
