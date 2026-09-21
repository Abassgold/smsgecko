'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

export interface QA {
  q: string;
  a: string;
}

export function Accordion({ items }: { items: QA[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className="rounded-2xl border border-border bg-surface/60 transition-colors"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium"
              aria-expanded={isOpen}
            >
              {item.q}
              <span
                className={cn(
                  'text-lg text-accent transition-transform',
                  isOpen ? 'rotate-45' : 'rotate-0',
                )}
              >
                +
              </span>
            </button>
            <div
              className={cn(
                'grid overflow-hidden px-5 text-sm text-muted transition-all',
                isOpen ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]',
              )}
            >
              <div className="min-h-0 whitespace-pre-line leading-relaxed">{item.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
