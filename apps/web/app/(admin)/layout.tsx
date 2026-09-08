'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { LoadingRow } from '@/components/ui/spinner';
import { useMe } from '@/lib/hooks';
import { ApiError, apiFetch } from '@/lib/api';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const role = me.data?.user.role;

  useEffect(() => {
    if (me.isError && me.error instanceof ApiError && me.error.status === 401) {
      apiFetch('/v1/auth/logout', { method: 'POST' }).finally(() => router.replace('/login'));
    } else if (me.data && role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [me.isError, me.error, me.data, role, router]);

  if (me.isLoading || !me.data) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <LoadingRow label="Checking access…" />
      </div>
    );
  }
  if (role !== 'admin') {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-8 text-sm text-muted">
        Admin access required. Redirecting…
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
