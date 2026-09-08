'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { CopyButton } from '@/components/ui/copy-button';
import { Badge } from '@/components/ui/badge';
import { LoadingRow } from '@/components/ui/spinner';
import { formatTimeAgo } from '@/lib/format';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/lib/hooks';

export function ApiKeys() {
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [label, setLabel] = useState('');
  const [freshKey, setFreshKey] = useState<string | null>(null);

  return (
    <Card className="p-6">
      <h3 className="font-display text-sm font-semibold">API keys</h3>
      <p className="mt-1 text-sm text-muted">
        Use a key as <code className="text-xs">Authorization: Bearer …</code> against{' '}
        <code className="text-xs">/api/v2</code>.
      </p>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(label || 'API key', {
            onSuccess: (k) => {
              setFreshKey(k.key);
              setLabel('');
            },
          });
        }}
      >
        <TextInput
          placeholder="Label (e.g. production)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </form>

      {freshKey ? (
        <div className="mt-4 rounded-xl border border-[var(--accent-ring)]/40 bg-accent-soft p-4">
          <div className="text-xs text-faint">Copy this now — it won&apos;t be shown again.</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="truncate rounded-lg bg-bg px-2 py-1 font-mono text-xs">{freshKey}</code>
            <CopyButton value={freshKey} />
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        {keys.isLoading ? (
          <LoadingRow />
        ) : !keys.data || keys.data.length === 0 ? (
          <p className="text-sm text-faint">No keys yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {keys.data.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.label}</span>
                    {k.revoked ? <Badge tone="danger">Revoked</Badge> : null}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-faint">
                    {k.prefix}… ·{' '}
                    {k.lastUsedAt ? `used ${formatTimeAgo(k.lastUsedAt)}` : 'never used'}
                  </div>
                </div>
                {!k.revoked ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(k.id)}
                    disabled={revoke.isPending}
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
