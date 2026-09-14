'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { DepositView } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { CopyButton } from '@/components/ui/copy-button';
import { formatUsd, usdToMicro } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useConfirmDeposit, useCreateDeposit } from '@/lib/hooks';
import { depositMethodInfo } from '../methods';

const QUICK = [5, 10, 25, 50, 100];

export function DepositMethodClient() {
  const params = useParams<{ method: string }>();
  const method = params.method;
  const info = depositMethodInfo(method);

  const createDeposit = useCreateDeposit();
  const confirmDeposit = useConfirmDeposit();
  const [amount, setAmount] = useState('10');
  const [pending, setPending] = useState<DepositView | null>(null);
  const [done, setDone] = useState(false);

  if (!info) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <p className="text-sm text-muted">Unknown payment method.</p>
        <Link href="/deposit" className="text-sm text-accent">
          ← Choose a method
        </Link>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    const amountMicro = usdToMicro(Number(amount));
    createDeposit.mutate(
      { method, amountMicro },
      {
        onSuccess: (dep) => {
          if (method === 'mock' || method === 'qris') {
            confirmDeposit.mutate(dep.id, { onSuccess: () => setDone(true) });
          } else if (dep.payUrl && /^https?:\/\//.test(dep.payUrl)) {
            // Real hosted checkout (Stripe / Korapay / NowPayments /
            // Cryptomus) — leave the app; it redirects back to /deposit.
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
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/deposit" className="text-xs text-accent">
            ← All methods
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold">Deposit — {info.label}</h1>
            <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-faint">
              {info.fee} fee
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{info.blurb}</p>
        </div>
      </div>

      <Card className="p-6">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field
            label="Amount (USD)"
            hint={
              method === 'korapay'
                ? 'Minimum $0.50. Charged in NGN at the current rate.'
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
            {createDeposit.isPending || confirmDeposit.isPending ? 'Processing…' : `Deposit via ${info.label}`}
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
  );
}
