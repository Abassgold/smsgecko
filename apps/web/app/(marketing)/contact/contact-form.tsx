'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ContactForm() {
  const [sent, setSent] = useState(false);

  return (
    <Card className="mt-8 p-6">
      {sent ? (
        <div className="py-8 text-center">
          <div className="font-display text-lg font-semibold">Thanks — message noted.</div>
          <p className="mt-2 text-sm text-muted">(Nothing was actually sent. It&apos;s a demo.)</p>
          <Button className="mt-6" variant="secondary" onClick={() => setSent(false)}>
            Send another
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <Field label="Name">
            <input required className={inputCls} placeholder="Ada Lovelace" />
          </Field>
          <Field label="Email">
            <input required type="email" className={inputCls} placeholder="you@example.com" />
          </Field>
          <Field label="Message">
            <textarea required rows={5} className={inputCls} placeholder="How can we help?" />
          </Field>
          <Button type="submit" className="self-start">
            Send message
          </Button>
        </form>
      )}
    </Card>
  );
}

const inputCls =
  'w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm outline-none placeholder:text-faint focus:border-border-strong';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-widest text-faint">{label}</span>
      {children}
    </label>
  );
}
