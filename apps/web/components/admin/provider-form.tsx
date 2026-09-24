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

/** Adapters ported from FloZap — each takes a plain JSON config blob. */
const RESELLER_KEYS = ['hero_sms', 'sms_bower', 'sms_code', 'sms_pool'] as const;
const RESELLER_LABELS: Record<(typeof RESELLER_KEYS)[number], string> = {
  hero_sms: 'hero-sms',
  sms_bower: 'smsbower',
  sms_code: 'smscode',
  sms_pool: 'smspool',
};

export function ProviderForm({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const editing = mode.kind === 'edit' ? mode.provider : null;

  const [key, setKey] = useState<ProviderKey>(editing?.key ?? 'custom_http');
  const [label, setLabel] = useState(editing?.label ?? '');
  const [enabled, setEnabled] = useState(editing?.enabled ?? false);
  const [priority, setPriority] = useState(String(editing?.priority ?? 100));

  const c = (editing?.config ?? {}) as Record<string, unknown>;
  const [baseUrl, setBaseUrl] = useState(String(c.baseUrl ?? ''));
  const [apiKey, setApiKey] = useState(String(c.apiKey ?? ''));
  const [authMode, setAuthMode] = useState(String(c.authMode ?? 'query'));
  const [authParam, setAuthParam] = useState(String(c.authParam ?? ''));
  const [parseMode, setParseMode] = useState(String(c.parseMode ?? 'text'));
  const [method, setMethod] = useState(String(c.method ?? 'GET'));
  const [rentPath, setRentPath] = useState(String(c.rentPath ?? ''));
  const [statusPath, setStatusPath] = useState(String(c.statusPath ?? ''));
  const [cancelPath, setCancelPath] = useState(String(c.cancelPath ?? ''));
  const [healthPath, setHealthPath] = useState(String(c.healthPath ?? ''));
  const [mapJson, setMapJson] = useState(JSON.stringify(c.map ?? {}, null, 2));
  const [mapErr, setMapErr] = useState<string | null>(null);

  // Reseller adapters: the fields every one needs get real inputs; anything
  // else (serviceMap / countryMap / pricingOption…) stays in the JSON box.
  const extraConfig = Object.fromEntries(
    Object.entries(c).filter(([k]) => !['baseUrl', 'apiKey', 'userId'].includes(k)),
  );
  const [resellerBaseUrl, setResellerBaseUrl] = useState(String(c.baseUrl ?? ''));
  const [resellerApiKey, setResellerApiKey] = useState(String(c.apiKey ?? ''));
  const [resellerUserId, setResellerUserId] = useState(String(c.userId ?? ''));
  const [configJson, setConfigJson] = useState(JSON.stringify(extraConfig, null, 2));
  const [configErr, setConfigErr] = useState<string | null>(null);
  const isReseller = (RESELLER_KEYS as readonly string[]).includes(key);

  const pending = create.isPending || update.isPending;
  const err = create.error ?? update.error;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let map: unknown = {};
    if (key === 'custom_http') {
      try {
        map = mapJson.trim() ? JSON.parse(mapJson) : {};
        setMapErr(null);
      } catch {
        setMapErr('Response map is not valid JSON');
        return;
      }
    }
    let resellerConfig: unknown = {};
    if (isReseller) {
      try {
        resellerConfig = configJson.trim() ? JSON.parse(configJson) : {};
        setConfigErr(null);
      } catch {
        setConfigErr('Adapter config is not valid JSON');
        return;
      }
    }

    const config =
      key === 'custom_http'
        ? {
            baseUrl,
            apiKey,
            authMode,
            ...(authParam ? { authParam } : {}),
            parseMode,
            method,
            rentPath,
            statusPath,
            cancelPath,
            healthPath,
            map,
          }
        : isReseller
          ? {
              ...(resellerConfig as Record<string, unknown>),
              baseUrl: resellerBaseUrl.trim(),
              apiKey: resellerApiKey.trim(),
              ...(key === 'sms_bower' ? { userId: resellerUserId.trim() } : {}),
            }
          : {};

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
            <option value="custom_http">Generic HTTP</option>
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

      {key === 'custom_http' ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2/50 p-4">
          <div className="text-xs uppercase tracking-widest text-faint">HTTP config</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base URL">
              <TextInput value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.reseller.com" />
            </Field>
            <Field label="API key">
              <TextInput
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={editing ? 'leave masked value to keep' : ''}
              />
            </Field>
            <Field label="Auth mode">
              <select value={authMode} onChange={(e) => setAuthMode(e.target.value)} className={inputClass}>
                <option value="query">Query param</option>
                <option value="header">Header</option>
                <option value="bearer">Bearer</option>
              </select>
            </Field>
            <Field label="Auth param name" hint="e.g. api_key or X-API-Key">
              <TextInput value={authParam} onChange={(e) => setAuthParam(e.target.value)} />
            </Field>
            <Field label="Parse mode">
              <select value={parseMode} onChange={(e) => setParseMode(e.target.value)} className={inputClass}>
                <option value="text">Text (handler-style)</option>
                <option value="json">JSON</option>
              </select>
            </Field>
            <Field label="HTTP method">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </Field>
          </div>
          <Field label="Rent path" hint="{service} {country} placeholders">
            <TextInput value={rentPath} onChange={(e) => setRentPath(e.target.value)} placeholder="/handler_api.php?action=getNumber&service={service}&country={country}" />
          </Field>
          <Field label="Status path" hint="{ref} placeholder">
            <TextInput value={statusPath} onChange={(e) => setStatusPath(e.target.value)} placeholder="/handler_api.php?action=getStatus&id={ref}" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cancel path">
              <TextInput value={cancelPath} onChange={(e) => setCancelPath(e.target.value)} />
            </Field>
            <Field label="Health path">
              <TextInput value={healthPath} onChange={(e) => setHealthPath(e.target.value)} />
            </Field>
          </div>
          <Field label="Response map (JSON)" error={mapErr ?? undefined}>
            <textarea
              value={mapJson}
              onChange={(e) => setMapJson(e.target.value)}
              rows={6}
              className={`${inputClass} font-mono text-xs`}
              spellCheck={false}
            />
          </Field>
        </div>
      ) : null}

      {isReseller ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-2/50 p-4">
          <div className="text-xs uppercase tracking-widest text-faint">Connection</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="API key" hint="From your account on the provider's site. Stored encrypted.">
              <TextInput
                type="password"
                autoComplete="off"
                value={resellerApiKey}
                onChange={(e) => setResellerApiKey(e.target.value)}
                placeholder={editing && resellerApiKey ? 'leave masked value to keep' : 'Paste the API key'}
              />
            </Field>
            {key === 'sms_bower' ? (
              <Field label="User ID" hint="smsbower requires it to rent numbers.">
                <TextInput value={resellerUserId} onChange={(e) => setResellerUserId(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Base URL">
              <TextInput value={resellerBaseUrl} onChange={(e) => setResellerBaseUrl(e.target.value)} />
            </Field>
          </div>
          <Field
            label="Advanced config (JSON, optional)"
            hint="serviceMap / countryMap translate smsgecko codes into this provider's own codes."
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
      ) : null}

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
