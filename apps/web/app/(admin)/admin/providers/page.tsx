'use client';

import { useState } from 'react';
import type { ProviderConfigView } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ProviderForm } from '@/components/admin/provider-form';
import { formatTimeAgo } from '@/lib/format';
import { ApiError } from '@/lib/api';
import {
  useAdminProviders,
  useDeleteProvider,
  useTestProvider,
  useUpdateProvider,
} from '@/lib/admin-hooks';

export default function AdminProvidersPage() {
  const { data: providers, isLoading } = useAdminProviders();
  const update = useUpdateProvider();
  const test = useTestProvider();
  const del = useDeleteProvider();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProviderConfigView | null>(null);
  const [deleting, setDeleting] = useState<ProviderConfigView | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Providers</h1>
          <p className="mt-1 text-sm text-muted">
            One provider is active at a time — it drives the storefront catalog and fulfils orders.
            Turning one on turns the others off.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add provider
        </Button>
      </div>

      {update.error ? (
        <p className="text-sm text-danger">
          {update.error instanceof ApiError ? update.error.message : 'Could not update the provider'}
        </p>
      ) : null}

      {isLoading ? (
        <LoadingRow />
      ) : !providers || providers.length === 0 ? (
        <EmptyState title="No providers" description="Add one to start renting numbers." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">Rented / Errors</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-faint">
                      {p.key === 'custom_http' ? 'generic HTTP' : `${p.key} adapter`}
                    </div>
                    {p.key !== 'custom_http' && !p.config.apiKey ? (
                      <div className="mt-1 text-xs text-warning">Needs an API key — click Edit</div>
                    ) : null}
                    {p.stats.lastError ? (
                      <div className="mt-1 max-w-xs truncate text-xs text-danger" title={p.stats.lastError}>
                        {p.stats.lastError}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Toggle
                      checked={p.enabled}
                      disabled={update.isPending}
                      onChange={(v) => update.mutate({ id: p.id, body: { enabled: v } })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {p.healthOk === null ? (
                      <span className="text-faint">—</span>
                    ) : p.healthOk ? (
                      <Badge tone="success">ok</Badge>
                    ) : (
                      <Badge tone="danger">down</Badge>
                    )}
                    {testResult[p.id] ? (
                      <div className="mt-1 max-w-56 truncate text-xs text-faint">
                        {testResult[p.id]}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {p.stats.rentSuccess} / <span className="text-danger">{p.stats.rentError}</span>
                    <div className="text-xs text-faint">{p.stats.otpReceived} OTPs</div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.stats.lastUsedAt ? formatTimeAgo(p.stats.lastUsedAt) : 'never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={test.isPending}
                        onClick={() =>
                          test.mutate(p.id, {
                            onSuccess: (r) =>
                              setTestResult((s) => ({ ...s, [p.id]: r.detail ?? (r.ok ? 'ok' : 'failed') })),
                          })
                        }
                      >
                        Test
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(p)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add provider" size="lg">
        <ProviderForm mode={{ kind: 'create' }} onDone={() => setAdding(false)} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.label ?? ''}`} size="lg">
        {editing ? (
          <ProviderForm mode={{ kind: 'edit', provider: editing }} onDone={() => setEditing(null)} />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.label ?? ''}?`}
        body="This removes the provider config. Orders already fulfilled by it keep working."
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onConfirm={() =>
          deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />
    </div>
  );
}
