import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function StatRow({
  stats,
  className,
}: {
  stats: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:divide-x sm:divide-border',
        className,
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="px-4 text-center">
          <div className="font-display text-3xl font-bold sm:text-4xl">{s.value}</div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-faint">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function StatTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: 'accent' | 'success';
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/70 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-faint">{label}</span>
        {icon ? (
          <span
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg border border-border',
              accent === 'success' && 'text-success',
              accent === 'accent' && 'text-accent',
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}
