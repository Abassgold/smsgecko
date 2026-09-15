import type { ReactNode } from 'react';

/** A settings-card heading with a colored chevron prefix — the section
 * marker smscode.gg's account page uses throughout, in our own accent. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold">
      <span aria-hidden className="text-accent">
        ❯
      </span>
      {children}
    </h3>
  );
}
