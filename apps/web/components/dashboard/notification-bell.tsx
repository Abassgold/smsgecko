'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatTimeAgo } from '@/lib/format';
import { useMarkNotificationsRead, useNotifications } from '@/lib/hooks';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = notifications.data?.unreadCount ?? 0;
  const items = notifications.data?.items ?? [];

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const fresh = await notifications.refetch();
    if ((fresh.data?.unreadCount ?? 0) > 0) markRead.mutate();
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-border text-muted hover:text-text"
        aria-label="Notifications"
      >
        <span className="text-base">🔔</span>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-contrast">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-surface p-2 shadow-xl">
          <div className="px-2 py-1.5 text-xs uppercase tracking-widest text-faint">
            Notifications
          </div>
          {items.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-faint">Nothing yet.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => {
                const inner = (
                  <>
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body ? <div className="text-xs text-muted">{n.body}</div> : null}
                    <div className="mt-0.5 text-[11px] text-faint">
                      {formatTimeAgo(n.createdAt)}
                    </div>
                  </>
                );
                return (
                  <li key={n.id} className="rounded-lg px-2 py-2 hover:bg-surface-2">
                    {n.orderId ? (
                      <Link href={`/orders/${n.orderId}`} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
