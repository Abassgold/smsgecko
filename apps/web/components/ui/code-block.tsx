'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CodeTab {
  label: string;
  language: string;
  code: string;
}

/** Small caps label sitting above a code block, e.g. "Example request". */
export function CodeLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">
      {children}
    </div>
  );
}

export function CodeBlock({
  tabs,
  title,
  status,
}: {
  tabs: CodeTab[];
  title?: string;
  /** HTTP status line shown as a colored pill, e.g. "200 OK", "402 Payment Required". */
  status?: string;
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = tabs[active]!;
  const statusOk = status ? /^[23]/.test(status) : false;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-[#0b0b11]">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e5484d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#d9a441]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#46b17b]" />
        </span>
        {status ? (
          <span
            className={cn(
              'rounded-md px-2 py-0.5 font-mono text-[11px] font-bold',
              statusOk ? 'text-success' : 'text-danger',
            )}
          >
            {status}
          </span>
        ) : title ? (
          <span className="text-[11px] uppercase tracking-widest text-faint">{title}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActive(i)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                i === active ? 'bg-surface-2 text-text' : 'text-faint hover:text-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
          <code className="font-mono text-[#d6d6e0]">{current.code}</code>
        </pre>
        <button
          onClick={copy}
          className="absolute right-3 top-3 rounded-md border border-border bg-surface/80 px-2 py-1 text-[11px] text-muted hover:text-text"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
