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
          <svg width="34" height="34" viewBox="0 0 64 64" fill="none">
            <path
              d="M32,50 C34,58 42,60 47,55 C52,50 49,42 43,44"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path d="M27,33 C19,32 11,29 5,25" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            <path d="M37,33 C45,32 53,29 59,25" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            <path d="M25,45 C17,47 9,49 3,52" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            <path d="M39,45 C47,47 55,49 61,52" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            <path
              d="M32,8 C36,8 39,11 39,15 C39,17.5 38,19.5 36,21 C42,24 47,33 47,42 C47,49 40,55 32,55 C24,55 17,49 17,42 C17,33 22,24 28,21 C26,19.5 25,17.5 25,15 C25,11 28,8 32,8 Z"
              fill="currentColor"
            />
            <circle cx="28" cy="16" r="1.8" fill="var(--accent-contrast)" />
            <circle cx="36" cy="16" r="1.8" fill="var(--accent-contrast)" />
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
      <Section className="pt-0 ">
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
