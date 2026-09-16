'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { DepositMethod } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/ui/section-title';
import { Button } from '@/components/ui/button';
import { formatBalanceUsd, usdToMicro } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useCreateDeposit, useWallet } from '@/lib/hooks';
import { DEPOSIT_METHOD_INFO, depositMethodInfo } from './methods';
import { DepositHistory } from './deposit-history';

const QUICK = [5, 10, 25, 50, 100];

const FIELD_LABEL = 'text-[13px] font-semibold tracking-[0.02em] text-faint';
const FIELD_INPUT =
  'w-full rounded-xl border border-border bg-surface-2 px-4 py-3.5 text-[15px] outline-none placeholder:text-faint focus:border-border-strong';
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
  const createDeposit = useCreateDeposit();

  const [amount, setAmount] = useState('10');
  const [method, setMethod] = useState<DepositMethod | ''>('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!method) return;
    const amountMicro = usdToMicro(Number(amount));
    createDeposit.mutate(
      { method, amountMicro },
      {
        // Every gateway hands back its own hosted checkout URL — the
        // deposit form always ends by sending the customer there to
        // actually pay.
        onSuccess: (dep) => {
          if (dep.payUrl) window.location.href = dep.payUrl;
        },
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Deposit</h1>
        <Link href="/dashboard" className="text-sm text-accent">
          ← Dashboard
        </Link>
      </div>

      <Card className="flex items-center justify-between rounded-[14px] border-[rgba(70,177,123,0.25)] px-6 py-4">
        <span className="text-xs uppercase tracking-widest text-faint">Available balance</span>
        <span className="font-mono text-lg text-success">
          ≈ {formatBalanceUsd(wallet.data?.balanceMicro ?? 0)}
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

      <Card className="p-7">
        <SectionTitle>New Deposit</SectionTitle>

        <form className="mt-4 flex flex-col gap-5" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>Payment Method</label>
            <select
              required
              value={method}
              onChange={(e) => setMethod(e.target.value as DepositMethod)}
              className={FIELD_INPUT}
            >
              <option value="" disabled>
                Select a payment method
              </option>
              {DEPOSIT_METHOD_INFO.map((m) => (
                <option key={m.method} value={m.method}>
                  {m.label} — {m.fee} fee
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>Amount (USD)</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              required
              placeholder="Enter amount in USD"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={FIELD_INPUT}
            />
            <span className="text-xs text-faint">Minimum $0.50.</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="rounded-lg border border-border bg-surface-2 px-3.5 py-1.5 text-[12.5px] font-semibold text-muted hover:text-text"
              >
                ${v}
              </button>
            ))}
          </div>

          {createDeposit.isError ? (
            <p className="text-sm text-danger">
              {createDeposit.error instanceof ApiError
                ? createDeposit.error.message
                : 'Could not create the deposit'}
            </p>
          ) : null}

          <Button type="submit" className="self-start" disabled={createDeposit.isPending}>
            {createDeposit.isPending ? 'Processing…' : 'Create Deposit'}
          </Button>
        </form>
      </Card>

      <button
        type="button"
        onClick={() => setMethod('crypto_usdt')}
        className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 text-left transition hover:border-[var(--accent-ring)]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          ₿
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold">
            {depositMethodInfo('crypto_usdt')?.label ?? 'Pay with crypto'} (USDT)
          </span>
          <span className="block text-xs text-muted">
            Select it above, then send USDT via a hosted crypto checkout.
          </span>
        </span>
        <span className="text-accent">→</span>
      </button>

      <DepositHistory />
    </div>
  );
}
