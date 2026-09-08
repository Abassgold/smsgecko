'use client';

import { useEffect, useState } from 'react';
import type { SettingsView } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Toggle } from '@/components/ui/toggle';
import { LoadingRow } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';
import { useAdminSettings, useUpdateSettings } from '@/lib/admin-hooks';

export default function AdminSettingsPage() {
  const { data, isLoading } = useAdminSettings();
  const update = useUpdateSettings();
  const [form, setForm] = useState<SettingsView | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (isLoading || !form) return <LoadingRow />;

  const num = (k: keyof SettingsView) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });

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
          <h3 className="font-display text-sm font-semibold">Mock provider</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Success rate (0–1)">
              <TextInput type="number" step="0.05" min="0" max="1" value={form.mockSmsSuccessRate} onChange={num('mockSmsSuccessRate')} />
            </Field>
            <Field label="Min delay (ms)">
              <TextInput type="number" min="0" value={form.mockSmsMinDelayMs} onChange={num('mockSmsMinDelayMs')} />
            </Field>
            <Field label="Max delay (ms)">
              <TextInput type="number" min="0" value={form.mockSmsMaxDelayMs} onChange={num('mockSmsMaxDelayMs')} />
            </Field>
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
            <Field label="Number markup (%)" hint="Added over the provider's raw price">
              <TextInput type="number" step="0.5" min="0" max="1000" value={form.numberMarkupPercent} onChange={num('numberMarkupPercent')} />
            </Field>
            <Field label="Number markup flat (micro-USD)">
              <TextInput type="number" min="0" value={form.numberMarkupFlatMicro} onChange={num('numberMarkupFlatMicro')} />
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
