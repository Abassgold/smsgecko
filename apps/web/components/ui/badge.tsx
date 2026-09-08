import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'default' | 'accent' | 'success' | 'danger' | 'muted' | 'warning';

const tones: Record<Tone, string> = {
  default: 'bg-surface-2 text-muted border-border',
  accent: 'bg-accent-soft text-accent border-[var(--accent-ring)]/30',
  success: 'bg-[rgba(53,208,127,0.12)] text-success border-[rgba(53,208,127,0.3)]',
  danger: 'bg-[var(--danger-soft)] text-danger border-[rgba(229,100,107,0.3)]',
  warning: 'bg-[rgba(217,164,65,0.12)] text-warning border-[rgba(217,164,65,0.3)]',
  muted: 'bg-transparent text-faint border-border',
};

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
