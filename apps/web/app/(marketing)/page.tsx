import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { Section, SectionHeading } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatRow } from '@/components/ui/stat';
import { CodeBlock } from '@/components/ui/code-block';
import { Accordion } from '@/components/ui/accordion';
import {
  FAQ,
  HERO_STATS,
  HOW_IT_WORKS,
  PLATFORMS,
  QUICK_START,
  TESTIMONIALS,
  WHAT_IT_DOES,
} from '@/components/marketing/content';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <Container size="wide" className="pt-16 pb-8 text-center sm:pt-24">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent">
          <svg width="30" height="30" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 5.5A3.5 3.5 0 0 1 5.5 2h5A3.5 3.5 0 0 1 14 5.5v3A3.5 3.5 0 0 1 10.5 12H7l-3.2 2.4A.5.5 0 0 1 3 14v-2.2A3.5 3.5 0 0 1 2 8.5v-3Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <h1 className="mt-8 font-display text-5xl font-bold tracking-tight sm:text-7xl">
          <span className="text-gradient">SMSGecko</span>
        </h1>
        <p className="mt-2 text-sm text-muted">Virtual Numbers for OTP &amp; Verification</p>
        <p className="mt-4 font-display text-lg font-semibold uppercase tracking-wide text-accent sm:text-xl">
          Catch every verification code.
        </p>
        <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-muted">
          Buy virtual numbers for OTP &amp; verification — fast activation, clean stock, global
          coverage. Use it via API or dashboard for WhatsApp, Telegram, Gmail, and more.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href="/register" size="lg">
            Get Started Free
          </Button>
          <Button href="/docs" variant="secondary" size="lg">
            View API Docs
          </Button>
        </div>
        <div className="mx-auto mt-10 flex max-w-xl items-center gap-3 rounded-full border border-border bg-surface/60 px-4 py-2 text-sm text-muted">
          <Badge tone="accent">New</Badge>
          <span className="truncate">
            Building a verification flow? Read the Quick Start below.
          </span>
        </div>
        <div className="mt-16">
          <StatRow stats={HERO_STATS} />
        </div>
      </Container>

      {/* How it works */}
      <Section>
        <Container size="wide">
          <SectionHeading>How It Works</SectionHeading>
          <div className="mt-10 grid gap-4 lg:grid-cols-[repeat(3,1fr)_1.3fr]">
            {HOW_IT_WORKS.map((s) => (
              <Card key={s.step} className="p-5">
                <div className="font-display text-sm font-bold text-faint">{s.step}</div>
                <div className="mt-3 font-display text-base font-semibold">{s.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </Card>
            ))}
            <Card className="bg-accent-soft/40 p-5">
              <div className="font-display text-base font-semibold">
                Choose a number from live inventory
              </div>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
                <li>→ Live stock checks before order submit</li>
                <li>→ Coverage across 200+ countries and 1,000+ platforms</li>
                <li>→ Pricing visible before purchase</li>
              </ul>
            </Card>
          </div>
        </Container>
      </Section>

      {/* Quick start */}
      <Section className="pt-0">
        <Container size="wide">
          <SectionHeading>Quick Start</SectionHeading>
          <div className="mt-8">
            <CodeBlock tabs={QUICK_START} title="SDK quickstart · /v2 by default" />
          </div>
          <p className="mt-4 text-center text-sm text-faint">
            Get your API key from <span className="text-accent">Account Settings</span>. Full docs
            at <span className="text-accent">/docs</span>.
          </p>
        </Container>
      </Section>

      {/* What it does */}
      <Section className="pt-0">
        <Container size="wide">
          <SectionHeading>What SMSGecko Does</SectionHeading>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {WHAT_IT_DOES.map((c) => (
              <Card key={c.title} className="p-6">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent">
                  ✳
                </div>
                <div className="mt-4 font-display text-base font-semibold">{c.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* Platforms */}
      <Section className="pt-0">
        <Container size="wide">
          <SectionHeading>Works With Everything</SectionHeading>
          <p className="mt-3 text-sm text-muted">
            Verify accounts on 1,000+ platforms across messaging, social, and AI.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {PLATFORMS.map((p) => (
              <span
                key={p}
                className="rounded-full border border-border bg-surface/60 px-3.5 py-1.5 text-sm text-muted"
              >
                {p}
              </span>
            ))}
          </div>
          <div className="mt-6 flex gap-5 text-sm text-accent">
            <a href="/platforms">View supported platforms →</a>
            <a href="/faq">See common use cases →</a>
          </div>
        </Container>
      </Section>

      {/* Testimonials */}
      <Section className="pt-0">
        <Container size="wide">
          <SectionHeading>What People Say</SectionHeading>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <Card key={t.handle} className="p-6">
                <p className="text-sm leading-relaxed text-text/90">&ldquo;{t.body}&rdquo;</p>
                <div className="mt-4 text-sm text-accent">{t.handle}</div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section className="pt-0">
        <Container size="narrow">
          <SectionHeading className="text-center">Frequently Asked Questions</SectionHeading>
          <div className="mt-10">
            <Accordion items={FAQ} />
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="pt-0">
        <Container size="wide">
          <Card className="p-10 text-center">
            <SectionHeading className="justify-center">Ready to Get Started?</SectionHeading>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted">
              Join developers using SMSGecko for fast, reliable verification.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/register" size="lg">
                Create Free Account
              </Button>
              <Button href="/docs" variant="secondary" size="lg">
                Read the Docs
              </Button>
            </div>
          </Card>
        </Container>
      </Section>
    </>
  );
}
