import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { PlatformGrid } from './platform-grid';

export const metadata: Metadata = {
  title: 'Supported Platforms',
  description:
    'Receive verification codes for 1,000+ platforms across 200+ countries — messaging apps, social networks, marketplaces, finance apps, and AI tools.',
  alternates: { canonical: '/platforms' },
};

export default function PlatformsPage() {
  return (
    <>
      <Container size="wide" className="pt-16 pb-8 text-center sm:pt-24">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">Platforms</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">
          Receive verification codes for messaging apps, social networks, marketplaces, finance
          apps, and AI tools — 1,000+ services across 200+ countries.
        </p>
      </Container>

      <Section className="pt-4">
        <Container size="wide">
          <PlatformGrid />
          <div className="mt-10 text-center">
            <Button href="/register" size="lg">
              Browse the full catalog
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
