'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className={cn(
        'rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-text',
        className,
      )}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
