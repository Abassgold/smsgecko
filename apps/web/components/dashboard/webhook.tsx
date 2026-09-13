'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, inputClass, TextInput } from '@/components/ui/field';
import { CopyButton } from '@/components/ui/copy-button';
import { Badge } from '@/components/ui/badge';
import { LoadingRow } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/api';
import { useTestWebhook, useUpdateWebhook, useWebhook } from '@/lib/hooks';

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function Webhook() {
  const webhook = useWebhook();
  const update = useUpdateWebhook();
  const test = useTestWebhook();
  const [url, setUrl] = useState('');

  // Seed the field once the current config loads — an uncontrolled-to-controlled
  // flip would warn, and typing shouldn't get stomped by a background refetch.
  useEffect(() => {
    if (webhook.data && url === '') setUrl(webhook.data.webhookUrl ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook.data]);

  if (webhook.isLoading) {
    return (
      <Card className="p-6">
        <h3 className="font-display text-sm font-semibold">Webhook</h3>
        <LoadingRow />
      </Card>
    );
  }

  const configured = Boolean(webhook.data?.webhookUrl);

  return (
    <Card className="p-6">
      <h3 className="font-display text-sm font-semibold">Webhook</h3>
      <p className="mt-1 text-sm text-muted">
        Receive real-time push notifications when order events occur (created, completed,
        expired, canceled) instead of polling.
      </p>

      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          test.reset();
          update.mutate({ webhookUrl: url.trim() || null });
        }}
      >
        <Field label="Webhook URL" hint="Must use HTTPS. Leave empty to disable.">
          <TextInput
            type="url"
            placeholder="https://example.com/webhooks/smsgecko"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>

        {configured && webhook.data?.webhookSecret ? (
          <Field
            label="Webhook Secret"
            hint="Used to verify webhook signatures (HMAC-SHA256). Read-only — rotate it below if it may have leaked."
          >
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <LockIcon />
                <input
                  readOnly
                  value={webhook.data.webhookSecret}
                  className={cn(inputClass, 'pl-9 font-mono text-xs')}
                />
              </div>
              <CopyButton value={webhook.data.webhookSecret} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={update.isPending}
                onClick={() => {
                  test.reset();
                  update.mutate({ regenerateSecret: true });
                }}
              >
                Regenerate
              </Button>
            </div>
          </Field>
        ) : null}

        {update.isError ? (
          <p className="text-sm text-danger">
            {update.error instanceof ApiError ? update.error.message : 'Could not save the webhook'}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Webhook'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!configured || test.isPending}
            onClick={() => test.mutate()}
          >
            {test.isPending ? 'Sending…' : 'Send Test'}
          </Button>

          {test.data ? (
            <Badge tone={test.data.delivered ? 'success' : 'danger'}>
              {test.data.delivered
                ? `Delivered · ${test.data.statusCode}`
                : test.data.statusCode
                  ? `Failed · ${test.data.statusCode}`
                  : 'Failed · no response'}
            </Badge>
          ) : test.isError ? (
            <Badge tone="danger">
              {test.error instanceof ApiError ? test.error.message : 'Could not send test event'}
            </Badge>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
