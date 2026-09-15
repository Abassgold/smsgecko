'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/ui/section-title';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Badge } from '@/components/ui/badge';
import { LoadingRow } from '@/components/ui/spinner';
import { formatTimeAgo } from '@/lib/format';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/lib/hooks';

export function ApiKeys() {
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const hasKey = (keys.data?.length ?? 0) > 0;

  return (
    <Card className="p-6">
      <SectionTitle>API key</SectionTitle>
      <p className="mt-1 text-sm text-muted">
        Use it as <code className="text-xs">Authorization: Bearer …</code> against{' '}
        <code className="text-xs">/api/v2</code>. One key at a time — generating a new one
        immediately revokes whichever key you had before.
      </p>

      <div className="mt-4">
        <Button
          disabled={create.isPending}
          onClick={() => create.mutate('API key', { onSuccess: (k) => setFreshKey(k.key) })}
        >
          {create.isPending ? 'Generating…' : hasKey ? 'Regenerate' : 'Generate'}
        </Button>
      </div>

      {freshKey ? (
        <div className="mt-4 rounded-xl border border-[var(--accent-ring)]/40 bg-accent-soft p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-faint">Copy this now — it won&apos;t be shown again.</div>
            <button
              type="button"
              onClick={() => setFreshKey(null)}
              aria-label="Close"
              className="shrink-0 text-faint hover:text-text"
            >
              ✕
            </button>
          </div>
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
          <p className="text-sm text-faint">No key yet — generate one to use the API.</p>
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
                    <Badge tone="success">Active</Badge>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-faint">
                    {k.prefix}… ·{' '}
                    {k.lastUsedAt ? `used ${formatTimeAgo(k.lastUsedAt)}` : 'never used'}
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => revoke.mutate(k.id, { onSuccess: () => setFreshKey(null) })}
                  disabled={revoke.isPending}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
