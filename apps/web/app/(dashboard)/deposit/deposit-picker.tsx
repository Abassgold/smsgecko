'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { KORAPAY_CURRENCIES, KORAPAY_COUNTRY_LABEL } from '@smsgecko/shared';
import type { DepositMethod, DepositView, KorapayCurrency } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/cn';
import { formatBalanceUsd, formatUsd, usdToMicro } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useConfirmDeposit, useCreateDeposit, useWallet } from '@/lib/hooks';
import { DEPOSIT_METHOD_INFO, GROUP_LABEL, depositMethodInfo, type DepositMethodInfo } from './methods';
import { DepositHistory } from './deposit-history';

const GROUPS: DepositMethodInfo['group'][] = ['fiat', 'crypto', 'dev'];
const QUICK = [5, 10, 25, 50, 100];

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
  const createDeposit = useCreateDeposit();
  const confirmDeposit = useConfirmDeposit();

  const [amount, setAmount] = useState('10');
  const [method, setMethod] = useState<DepositMethod>('card');
  const [korapayCurrency, setKorapayCurrency] = useState<KorapayCurrency>('NGN');
  const [pending, setPending] = useState<DepositView | null>(null);
  const [done, setDone] = useState(false);

  const info = depositMethodInfo(method)!;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    const amountMicro = usdToMicro(Number(amount));
    createDeposit.mutate(
      { method, amountMicro, ...(method === 'korapay' ? { korapayCurrency } : {}) },
      {
        onSuccess: (dep) => {
          if (method === 'mock' || method === 'qris') {
            confirmDeposit.mutate(dep.id, { onSuccess: () => setDone(true) });
          } else if (dep.payUrl && /^https?:\/\//.test(dep.payUrl)) {
            // Real hosted checkout (Stripe / Korapay / NowPayments /
            // Cryptomus) — leave the app; it redirects back here.
            window.location.href = dep.payUrl;
          } else {
            setPending(dep);
          }
        },
      },
    );
  };

  const simulatePaid = () => {
    if (!pending) return;
    confirmDeposit.mutate(pending.id, {
      onSuccess: () => {
        setPending(null);
        setDone(true);
      },
    });
  };

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

        <Card className="p-6">
          <form className="flex flex-col gap-6" onSubmit={submit}>
            <Field
              label="Amount (USD)"
              hint={
                method === 'korapay'
                  ? `Minimum $0.50. Charged in ${korapayCurrency} at the current rate.`
                  : 'Minimum $0.50.'
              }
            >
              <TextInput
                type="number"
                min="0.5"
                step="0.5"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              {QUICK.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-muted hover:text-text"
                >
                  ${v}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-faint">
                Payment method
              </h3>
              {GROUPS.map((group) => {
                const methods = DEPOSIT_METHOD_INFO.filter((m) => m.group === group);
                if (methods.length === 0) return null;
                return (
                  <div key={group} className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-medium uppercase tracking-widest text-faint/80">
                      {GROUP_LABEL[group]}
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {methods.map((m) => (
                        <button
                          key={m.method}
                          type="button"
                          onClick={() => setMethod(m.method)}
                          className={cn(
                            'flex flex-col gap-1 rounded-2xl border p-4 text-left transition',
                            method === m.method
                              ? 'border-[var(--accent-ring)] bg-accent-soft/40 ring-1 ring-[var(--accent-ring)]'
                              : 'border-border bg-surface-2 hover:border-[var(--accent-ring)] hover:bg-accent-soft/20',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-semibold">{m.label}</span>
                            <span className="shrink-0 font-mono text-[11px] text-faint">{m.fee}</span>
                          </div>
                          <span className="text-xs text-muted">{m.blurb}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {method === 'korapay' ? (
              <Field label="Country">
                <select
                  value={korapayCurrency}
                  onChange={(e) => setKorapayCurrency(e.target.value as KorapayCurrency)}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-border-strong"
                >
                  {KORAPAY_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {KORAPAY_COUNTRY_LABEL[c]} ({c})
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {createDeposit.isError ? (
              <p className="text-sm text-danger">
                {createDeposit.error instanceof ApiError
                  ? createDeposit.error.message
                  : 'Could not create the deposit'}
              </p>
            ) : null}

            <Button
              type="submit"
              className="self-start"
              disabled={createDeposit.isPending || confirmDeposit.isPending}
            >
              {createDeposit.isPending || confirmDeposit.isPending
                ? 'Processing…'
                : `Deposit via ${info.label}`}
            </Button>
          </form>

          {done ? (
            <div className="mt-5 rounded-xl border border-[rgba(70,177,123,0.3)] bg-[rgba(70,177,123,0.1)] p-4 text-sm text-success">
              Deposit confirmed — balance updated.
            </div>
          ) : null}

          {pending ? (
            <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
              <div className="text-sm font-medium">
                Pay {formatUsd(pending.amountMicro)}
                {pending.payAddress ? ' in USDT' : ''}
              </div>
              {pending.payAddress ? (
                <div className="mt-2 flex items-center gap-2">
                  <code className="truncate rounded-lg bg-bg px-2 py-1 font-mono text-xs">
                    {pending.payAddress}
                  </code>
                  <CopyButton value={pending.payAddress} />
                </div>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={simulatePaid}
                disabled={confirmDeposit.isPending}
              >
                I&apos;ve sent it (simulate)
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="w-full lg:sticky lg:top-6 lg:w-80 lg:shrink-0">
        <DepositHistory />
      </div>
    </div>
  );
}
