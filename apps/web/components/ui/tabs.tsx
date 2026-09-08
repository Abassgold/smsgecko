'use client';

import { cn } from '@/lib/cn';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface/60 p-1">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm transition-colors',
            value === item.value ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
          )}
        >
          {item.label}
          {item.count !== undefined ? (
            <span className="ml-1.5 rounded-md bg-bg/60 px-1.5 py-0.5 text-[11px] text-faint">
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
