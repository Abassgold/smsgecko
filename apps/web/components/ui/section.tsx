import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('py-16 sm:py-24', className)}>
      {children}
    </section>
  );
}

export function SectionHeading({
  children,
  className,
  as: Tag = 'h2',
}: {
  children: ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <Tag className={cn('section-kicker text-2xl font-bold sm:text-3xl', className)}>{children}</Tag>
  );
}
