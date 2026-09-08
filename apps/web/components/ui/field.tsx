import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const inputClass =
  'w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm outline-none placeholder:text-faint focus:border-border-strong disabled:opacity-60';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-widest text-faint">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      {hint && !error ? <span className="text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}
