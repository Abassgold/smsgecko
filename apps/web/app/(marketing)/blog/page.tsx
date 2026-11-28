import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { POSTS } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Blog: SMS Verification API Guides',
  description: 'Guides for developers and resellers: SMS verification APIs, switching from SMS-Activate, and running an OTP reseller bot.',
  alternates: { canonical: '/blog' },
};

export default function BlogPage() {
  return (
    <>
      <Container size="wide" className="pt-16 pb-8 text-center sm:pt-24">
        <h1 className="font-display text-4xl font-bold sm:text-5xl"><span className="text-gradient">Blog</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">Guides for developers and resellers.</p>
      </Container>
      <Section className="pt-4">
        <Container size="narrow">
          <ul className="flex flex-col gap-4">
            {POSTS.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}`} className="block rounded-2xl border border-border bg-surface p-5 hover:border-border-strong">
                  <time className="text-xs text-faint">{p.date}</time>
                  <h2 className="mt-1 font-semibold">{p.title}</h2>
                  <p className="mt-1 text-sm text-muted">{p.excerpt}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}
