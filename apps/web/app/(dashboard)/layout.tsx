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

  // Signed in but email not confirmed — the dashboard is off-limits until then.
  const unverified = Boolean(me.data && !me.data.user.isVerified);
  useEffect(() => {
    if (unverified) router.replace('/verify-email');
  }, [unverified, router]);

  const unreachable =
    me.isError && !(me.error instanceof ApiError && me.error.status === 401);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <DashHeader />
      <main className="flex-1 py-8">
        <Container size="wide">
          {me.isLoading || unverified ? (
            <LoadingRow label="Loading your dashboard…" />
          ) : unreachable ? (
            <div className="rounded-2xl border border-border bg-surface/60 p-8 text-center text-sm text-muted">
              We couldn&apos;t load your dashboard right now. Please{' '}
              <button className="text-accent" onClick={() => me.refetch()}>
                retry
              </button>
              {' '}in a moment.
              {process.env.NODE_ENV === 'development' && (
                <span className="mt-2 block text-xs opacity-70">
                  Dev: is the API running? <code>npm run dev:api</code> (port 4000).
                </span>
              )}
            </div>
          ) : (
            children
          )}
        </Container>
      </main>
    </div>
  );
}
