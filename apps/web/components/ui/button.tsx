import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-soft';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-contrast font-semibold hover:bg-accent-hover shadow-[0_8px_30px_-8px_var(--accent-ring)]',
  secondary: 'bg-surface-2 text-text border border-border-strong hover:bg-surface',
  outline: 'border border-border-strong text-text hover:bg-surface-2',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-danger text-white font-semibold hover:opacity-90',
  'danger-soft': 'border border-danger/30 bg-[var(--danger-soft)] text-danger hover:bg-danger/15',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type LinkProps = CommonProps & { href: string; external?: boolean };

export function Button(props: ButtonProps | LinkProps) {
  const { variant = 'primary', size = 'md', className, children } = props;
  const classes = cn(base, variants[variant], sizes[size], className);

  if ('href' in props && props.href) {
    if (props.external) {
      return (
        <a href={props.href} className={classes} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    }
    return (
      <Link href={props.href} className={classes}>
        {children}
      </Link>
    );
  }

  const { variant: _v, size: _s, className: _c, children: _ch, ...rest } = props as ButtonProps;
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
