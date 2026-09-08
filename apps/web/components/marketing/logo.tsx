import Link from 'next/link';
import { cn } from '@/lib/cn';

export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 font-display font-bold', className)}>
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent"
      >
        {/* stylised speech-bubble mark */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 5.5A3.5 3.5 0 0 1 5.5 2h5A3.5 3.5 0 0 1 14 5.5v3A3.5 3.5 0 0 1 10.5 12H7l-3.2 2.4A.5.5 0 0 1 3 14v-2.2A3.5 3.5 0 0 1 2 8.5v-3Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="text-[17px] tracking-tight">smsgecko</span>
    </Link>
  );
}
