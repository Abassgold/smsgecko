'use client';

import { useEffect, useState } from 'react';
import { KORAPAY_CURRENCIES, KORAPAY_COUNTRY_LABEL } from '@smsgecko/shared';
import type { SettingsView } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Toggle } from '@/components/ui/toggle';
import { LoadingRow } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';
import { formatUsd, microToUsd, usdToMicro } from '@/lib/format';
import { useAdminSettings, useUpdateSettings } from '@/lib/admin-hooks';

/** Preview: what a $0.20 provider price becomes for the customer. */
function previewMicro(pct: number, gainMicro: number): number {
  return Math.round(200_000 * (1 + (pct || 0) / 100)) + (gainMicro || 0);
}

export default function AdminSettingsPage() {
  const { data, isLoading } = useAdminSettings();
  const update = useUpdateSettings();
  const [form, setForm] = useState<SettingsView | null>(null);
  // The gain is stored in micro-USD but entered in dollars — keep the raw string
  // so the admin can type "0.30" without it snapping.
  const [gainUsd, setGainUsd] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !form) {
      setForm(data);
      setGainUsd(String(microToUsd(data.numberMarkupFlatMicro)));
    }
  }, [data, form]);

  if (isLoading || !form) return <LoadingRow />;

  const num = (k: keyof SettingsView) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });

  const onGain = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setGainUsd(v);
    setForm({ ...form, numberMarkupFlatMicro: Math.max(0, Math.round(usdToMicro(Number(v) || 0))) });
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          update.mutate(form, { onSuccess: () => setSaved(true) });
        }}
      >
        <Card className="flex flex-col gap-4 p-6">
          <h3 className="font-display text-sm font-semibold">Orders</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Order TTL (seconds)" hint="Auto-refund window">
              <TextInput type="number" min="30" value={form.orderTtlSeconds} onChange={num('orderTtlSeconds')} />
            </Field>
            <Field label="Provider poll interval (ms)">
              <TextInput type="number" min="1000" value={form.providerPollIntervalMs} onChange={num('providerPollIntervalMs')} />
            </Field>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <div>
            <h3 className="font-display text-sm font-semibold">Number pricing</h3>
            <p className="mt-1 text-xs text-muted">
              Your margin on top of the provider&apos;s live price. No currency conversion —
              the customer is billed in USD.
              <br />
              <span className="font-mono">customer&nbsp;=&nbsp;provider&nbsp;×&nbsp;(1&nbsp;+&nbsp;markup%)&nbsp;+&nbsp;gain</span>
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gain (USD)" hint="Flat amount added to every number">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={gainUsd}
                onChange={onGain}
              />
            </Field>
            <Field label="Markup (%)" hint="Percent of the provider price">
              <TextInput
                type="number"
                step="0.5"
                min="0"
                max="1000"
                value={form.numberMarkupPercent}
                onChange={num('numberMarkupPercent')}
              />
            </Field>
          </div>
          <p className="text-xs text-faint">
            Example: a $0.20 provider price →{' '}
            <span className="font-mono text-foreground">
              {formatUsd(previewMicro(form.numberMarkupPercent, form.numberMarkupFlatMicro))}
            </span>{' '}
            to the customer.
          </p>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <div>
            <h3 className="font-display text-sm font-semibold">Payments — Korapay FX rates</h3>
            <p className="mt-1 text-xs text-muted">
              Korapay never settles in USD — each African corridor bills in its own local
              currency. Deposits are quoted to the customer in USD, then converted at these rates
              before the charge is created. No live feed; update by hand as rates move.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {KORAPAY_CURRENCIES.map((currency) => (
              <Field key={currency} label={`USD → ${currency}`} hint={KORAPAY_COUNTRY_LABEL[currency]}>
                <TextInput
                  type="number"
                  step="0.01"
                  min="1"
                  value={form.korapayFxRates[currency]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      korapayFxRates: { ...form.korapayFxRates, [currency]: Number(e.target.value) },
                    })
                  }
                />
              </Field>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <h3 className="font-display text-sm font-semibold">Economics</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Affiliate rate (%)">
              <TextInput type="number" step="0.5" min="0" max="100" value={form.affiliateRatePct} onChange={num('affiliateRatePct')} />
            </Field>
            <Field label="Min deposit (micro-USD)">
              <TextInput type="number" min="0" value={form.minDepositMicro} onChange={num('minDepositMicro')} />
            </Field>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <h3 className="font-display text-sm font-semibold">Access</h3>
          <label className="flex items-center gap-3 text-sm">
            <Toggle checked={form.signupsEnabled} onChange={(v) => setForm({ ...form, signupsEnabled: v })} />
            New sign-ups enabled
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Toggle checked={form.maintenanceMode} onChange={(v) => setForm({ ...form, maintenanceMode: v })} />
            Maintenance mode <span className="text-faint">(blocks non-admin order creation)</span>
          </label>
        </Card>

        {update.isError ? (
          <p className="text-sm text-danger">
            {update.error instanceof ApiError ? update.error.message : 'Save failed'}
          </p>
        ) : null}
        {saved ? <p className="text-sm text-success">Saved.</p> : null}

        <Button type="submit" className="self-start" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </form>
    </div>
  );
}
