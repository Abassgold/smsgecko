import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Unsubscribed',
  robots: { index: false, follow: false },
};

export default function UnsubscribedPage() {
  return (
    <Section className="pt-16 sm:pt-24">
      <Container size="narrow">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">You&apos;re unsubscribed</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          You won&apos;t receive any more broadcast emails from SMSGecko. Account emails —
          verification, password resets, and anything about your own orders or deposits — are
          unaffected, since those aren&apos;t broadcasts.
        </p>
        <div className="mt-8">
          <Button href="/" variant="secondary">
            ← Back to SMSGecko
          </Button>
        </div>
      </Container>
    </Section>
  );
}
