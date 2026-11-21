'use client';

import { useState } from 'react';
import type { ProviderConfigView } from '@smsgecko/shared';
import { Button } from '@/components/ui/button';
import { Field, TextInput, inputClass } from '@/components/ui/field';
import { Toggle } from '@/components/ui/toggle';
import { ApiError } from '@/lib/api';
import { useCreateProvider, useUpdateProvider } from '@/lib/admin-hooks';

type Mode = { kind: 'create' } | { kind: 'edit'; provider: ProviderConfigView };
type ProviderKey = ProviderConfigView['key'];

/** The three providers we sell through. Each takes a plain JSON config blob; credentials come from env. */
const RESELLER_KEYS = ['tiger_sms', 'hero_sms', 'sms_bower'] as const;
const RESELLER_LABELS: Record<(typeof RESELLER_KEYS)[number], string> = {
  tiger_sms: 'tiger-sms',
  hero_sms: 'hero-sms',
  sms_bower: 'smsbower',
};

export function ProviderForm({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const editing = mode.kind === 'edit' ? mode.provider : null;

  const [key, setKey] = useState<ProviderKey>(editing?.key ?? 'tiger_sms');
  const [label, setLabel] = useState(editing?.label ?? '');
  const [enabled, setEnabled] = useState(editing?.enabled ?? false);
  const [priority, setPriority] = useState(String(editing?.priority ?? 100));

  const c = (editing?.config ?? {}) as Record<string, unknown>;

  // Reseller credentials come from env on the API (never stored); only
  // optional extras (serviceMap / countryMap / pricingOption…) are edited here.
  const extraConfig = Object.fromEntries(
    Object.entries(c).filter(([k]) => !['baseUrl', 'apiKey', 'userId'].includes(k)),
  );
  const [configJson, setConfigJson] = useState(JSON.stringify(extraConfig, null, 2));
  const [configErr, setConfigErr] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;
  const err = create.error ?? update.error;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let config: unknown = {};
    try {
      config = configJson.trim() ? JSON.parse(configJson) : {};
      setConfigErr(null);
    } catch {
      setConfigErr('Adapter config is not valid JSON');
      return;
    }

    if (mode.kind === 'create') {
      create.mutate(
        { key, label, enabled, priority: Number(priority), config },
        { onSuccess: onDone },
      );
    } else {
      update.mutate(
        { id: mode.provider.id, body: { label, enabled, priority: Number(priority), config } },
        { onSuccess: onDone },
      );
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} required minLength={2} />
        </Field>
        <Field label="Adapter">
          <select
            value={key}
            disabled={mode.kind === 'edit'}
            onChange={(e) => setKey(e.target.value as ProviderKey)}
            className={inputClass}
          >
            {RESELLER_KEYS.map((k) => (
              <option key={k} value={k}>
                {RESELLER_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" hint="Lower = tried first">
          <TextInput
            type="number"
            min="0"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </Field>
        <div className="flex items-end gap-2 pb-1">
          <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
          <span className="text-sm text-muted">Enabled</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2/50 p-4">
        <div className="text-xs uppercase tracking-widest text-faint">Credentials</div>
        <p className="text-xs text-muted">
          Read from the API&apos;s environment (Render → Environment), never stored here:{' '}
          {(editing?.envVars ?? []).length ? (
            (editing?.envVars ?? []).map((v, i) => (
              <span key={v}>
                {i ? ' + ' : ''}
                <code>{v}</code>
              </span>
            ))
          ) : (
            <span>the provider&apos;s API key variable</span>
          )}
          .
        </p>
        <Field
          label="Advanced config (JSON, optional)"
          hint="serviceMap / countryMap translate SMSGecko codes into this provider's own codes."
          error={configErr ?? undefined}
        >
          <textarea
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            rows={5}
            className={`${inputClass} font-mono text-xs`}
            spellCheck={false}
          />
        </Field>
      </div>

      {err ? (
        <p className="text-sm text-danger">
          {err instanceof ApiError ? err.message : 'Could not save the provider'}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? 'Saving…' : mode.kind === 'create' ? 'Add provider' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
