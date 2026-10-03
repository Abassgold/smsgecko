import Link from 'next/link';
import { cn } from '@/lib/cn';
import { GeckoGlyph } from './gecko-mark';

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 font-display font-bold', className)}>
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent"
      >
        {/* gecko mark */}
        <svg width="18" height="18" viewBox="0 0 64 64" fill="none">
          <GeckoGlyph />
        </svg>
      </span>
      <span className="text-[19px] tracking-tight">smsgecko</span>
    </Link>
  );
}
