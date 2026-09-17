'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export interface ChipItem {
  id: string;
  label: string;
  prefix?: ReactNode;
}

export function ChipPicker({
  items,
  value,
  onChange,
  query,
  onQueryChange,
  placeholder,
  loading,
  emptyLabel = 'No matches',
}: {
  items: ChipItem[];
  value: string | null;
  onChange: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  placeholder: string;
  loading?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm outline-none placeholder:text-faint focus:border-border-strong"
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            <Spinner />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto pr-1">
        {items.length === 0 && !loading ? (
          <span className="px-1 py-2 text-sm text-faint">{emptyLabel}</span>
        ) : null}
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                selected
                  ? 'border-accent bg-accent text-accent-contrast shadow-[0_4px_16px_-6px_var(--accent-ring)]'
                  : 'border-border bg-surface/60 text-muted hover:text-text',
              )}
            >
              {item.prefix}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
