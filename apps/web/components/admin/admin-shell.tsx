'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/marketing/logo';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { useLogout } from '@/lib/hooks';

const NAV = [
  { href: '/admin', label: 'Overview', icon: '▦' },
  { href: '/admin/providers', label: 'Providers', icon: '⇄' },
  { href: '/admin/users', label: 'Users', icon: '☺' },
  { href: '/admin/orders', label: 'Orders', icon: '▤' },
  { href: '/admin/catalog', label: 'Catalog', icon: '☰' },
  { href: '/admin/finance', label: 'Finance', icon: '$' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface/40 p-4 md:flex">
        <div className="flex items-center gap-2">
          <Logo href="/admin" />
          <Badge tone="accent">Admin</Badge>
        </div>
        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
                )}
              >
                <span className="w-4 text-center text-faint">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4 text-sm">
          <Link href="/dashboard" className="rounded-lg px-3 py-2 text-muted hover:text-text">
            ← Back to app
          </Link>
          <button
            onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace('/login') })}
            className="rounded-lg px-3 py-2 text-left text-muted hover:text-text"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3 md:hidden">
          <Logo href="/admin" />
          <Badge tone="accent">Admin</Badge>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm',
                (item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href))
                  ? 'bg-surface-2 text-text'
                  : 'text-muted',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
