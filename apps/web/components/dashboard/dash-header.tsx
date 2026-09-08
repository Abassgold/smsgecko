'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Container } from '@/components/ui/container';
import { Logo } from '@/components/marketing/logo';
import { NotificationBell } from './notification-bell';
import { cn } from '@/lib/cn';
import { formatBalanceUsd } from '@/lib/format';
import { useLogout, useMe, useWallet } from '@/lib/hooks';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/orders', label: 'Orders' },
  { href: '/deposit', label: 'Deposit' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/affiliate', label: 'Affiliate' },
  { href: '/docs', label: 'Docs' },
];

export function DashHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const wallet = useWallet();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);

  const balanceMicro = wallet.data?.balanceMicro ?? me.data?.user.balanceMicro ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
      <Container size="wide" className="flex h-16 items-center gap-4">
        <Logo href="/dashboard" />
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <span className="rounded-full border border-border bg-surface/60 px-3 py-1.5 font-mono text-sm text-success">
            {formatBalanceUsd(balanceMicro)}
          </span>
          <NotificationBell />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
              aria-label="Account menu"
            >
              {(me.data?.user.username ?? '?').slice(0, 1).toUpperCase()}
            </button>
            {menuOpen ? (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-surface p-2 text-sm shadow-xl">
                <div className="truncate px-2 py-1.5 text-xs text-faint">
                  {me.data?.user.email}
                </div>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-2 py-1.5 text-muted hover:bg-surface-2 hover:text-text"
                >
                  Settings
                </Link>
                {me.data?.user.role === 'admin' ? (
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-2 py-1.5 text-accent hover:bg-surface-2"
                  >
                    Admin panel
                  </Link>
                ) : null}
                <button
                  onClick={() =>
                    logout.mutate(undefined, { onSuccess: () => router.replace('/login') })
                  }
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-muted hover:bg-surface-2 hover:text-text"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </Container>

      <Container size="wide" className="flex gap-1 overflow-x-auto pb-2 md:hidden">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm',
                active ? 'bg-surface-2 text-text' : 'text-muted',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </Container>
    </header>
  );
}
