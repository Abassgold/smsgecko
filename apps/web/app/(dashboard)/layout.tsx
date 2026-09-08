'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { DashHeader } from '@/components/dashboard/dash-header';
import { LoadingRow } from '@/components/ui/spinner';
import { useMe } from '@/lib/hooks';
import { ApiError, apiFetch } from '@/lib/api';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    if (me.isError && me.error instanceof ApiError && me.error.status === 401) {
      // Clear any stale session cookie so proxy.ts doesn't bounce us back here.
      apiFetch('/v1/auth/logout', { method: 'POST' }).finally(() => router.replace('/login'));
    }
  }, [me.isError, me.error, router]);

  const unreachable =
    me.isError && !(me.error instanceof ApiError && me.error.status === 401);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <DashHeader />
      <main className="flex-1 py-8">
        <Container size="wide">
          {me.isLoading ? (
            <LoadingRow label="Loading your dashboard…" />
          ) : unreachable ? (
            <div className="rounded-2xl border border-border bg-surface/60 p-8 text-center text-sm text-muted">
              Can&apos;t reach the API. Make sure it&apos;s running on port 4000
              (<code>npm run dev:api</code>), then{' '}
              <button className="text-accent" onClick={() => me.refetch()}>
                retry
              </button>
              .
            </div>
          ) : (
            children
          )}
        </Container>
      </main>
    </div>
  );
}
