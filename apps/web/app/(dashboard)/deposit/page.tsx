'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { DepositView } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { CopyButton } from '@/components/ui/copy-button';
import { formatApproxUsd, formatUsd, usdToMicro } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useConfirmDeposit, useCreateDeposit, useWallet } from '@/lib/hooks';

const METHODS = [
  { value: 'mock', label: 'Mock wallet (instant)' },
  { value: 'qris', label: 'QRIS' },
  { value: 'crypto_usdt', label: 'Cryptocurrency (USDT)' },
];
const QUICK = [5, 10, 25, 50, 100];

export default function DepositPage() {
  const wallet = useWallet();
  const createDeposit = useCreateDeposit();
  const confirmDeposit = useConfirmDeposit();
  const [method, setMethod] = useState('mock');
  const [amount, setAmount] = useState('10');
  const [pending, setPending] = useState<DepositView | null>(null);
  const [done, setDone] = useState(false);

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
        <h1 className="font-display text-2xl font-bold">Deposit</h1>
        <Link href="/dashboard" className="text-sm text-accent">
          ← Dashboard
        </Link>
      </div>

      <Card className="flex items-center justify-between border-[rgba(70,177,123,0.25)] p-5">
        <span className="text-xs uppercase tracking-widest text-faint">Available balance</span>
        <span className="font-mono text-lg text-success">
          {formatApproxUsd(wallet.data?.balanceMicro ?? 0)}
        </span>
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-sm font-semibold">New deposit</h3>
        <form className="mt-5 flex flex-col gap-4" onSubmit={submit}>
          <Field label="Payment method">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-border-strong"
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Amount (USD)" hint="Minimum $0.50.">
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
            {createDeposit.isPending || confirmDeposit.isPending ? 'Processing…' : 'Create deposit'}
          </Button>
        </form>

        {done ? (
          <div className="mt-5 rounded-xl border border-[rgba(70,177,123,0.3)] bg-[rgba(70,177,123,0.1)] p-4 text-sm text-success">
            Deposit confirmed — balance updated.
          </div>
        ) : null}

        {pending ? (
          <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
            <div className="text-sm font-medium">Pay {formatUsd(pending.amountMicro)} in USDT</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="truncate rounded-lg bg-bg px-2 py-1 font-mono text-xs">
                {pending.payAddress}
              </code>
              <CopyButton value={pending.payAddress ?? ''} />
            </div>
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
