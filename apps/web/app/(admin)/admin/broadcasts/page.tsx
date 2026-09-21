'use client';

import { useState } from 'react';
import type { BroadcastStatus } from '@smsgecko/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, TextInput, inputClass } from '@/components/ui/field';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Pager } from '@/components/admin/transactions-table';
import { formatShortDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/api';
import { useAdminBroadcasts, useCreateBroadcast } from '@/lib/admin-hooks';

const STATUS_TONE: Record<BroadcastStatus, 'muted' | 'accent' | 'success' | 'danger'> = {
  pending: 'muted',
  sending: 'accent',
  completed: 'success',
  failed: 'danger',
};

export default function AdminBroadcastsPage() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [page, setPage] = useState(1);

  const broadcasts = useAdminBroadcasts(page);
  const create = useCreateBroadcast();
  const rows = broadcasts.data?.items ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { subject, body, audience: 'verified' },
      {
        onSuccess: () => {
          setSubject('');
          setBody('');
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Broadcast email</h1>
        <p className="mt-1 text-sm text-muted">
          Send one email to every verified user. Sending happens in the background in batches —
          this page updates live while one is in flight. Every email carries a real one-click
          unsubscribe link; unsubscribed users, and addresses that bounced or reported spam, are
          skipped automatically.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Subject">
            <TextInput
              required
              maxLength={200}
              placeholder="What's this about?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>

          <Field label="Message" hint="Plain text — line breaks are preserved. No HTML.">
            <textarea
              required
              rows={8}
              maxLength={20_000}
              placeholder="Write your message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={cn(inputClass, 'resize-y')}
            />
          </Field>

          {create.isError ? (
            <p className="text-sm text-danger">
              {create.error instanceof ApiError ? create.error.message : 'Could not queue the broadcast'}
            </p>
          ) : null}

          <Button type="submit" className="self-start" disabled={create.isPending}>
            {create.isPending ? 'Queuing…' : 'Send broadcast'}
          </Button>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        {broadcasts.isLoading ? (
          <LoadingRow />
        ) : rows.length === 0 ? (
          <EmptyState title="No broadcasts sent yet" />
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Audience</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Sent by</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="max-w-xs truncate px-4 py-3">{b.subject}</td>
                  <td className="px-4 py-3 capitalize text-muted">{b.audience}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {b.sentCount}/{b.totalRecipients || '…'}
                    {b.failedCount > 0 ? <span className="text-danger"> ({b.failedCount} failed)</span> : null}
                  </td>
                  <td className="px-4 py-3 text-muted">{b.createdBy.email}</td>
                  <td className="px-4 py-3 text-muted">{formatShortDateTime(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {broadcasts.data && broadcasts.data.totalPages > 1 ? (
          <Pager page={page} total={broadcasts.data.totalPages} onChange={setPage} />
        ) : null}
      </Card>
    </div>
  );
}
