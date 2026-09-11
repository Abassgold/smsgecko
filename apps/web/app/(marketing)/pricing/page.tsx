import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { Section, SectionHeading } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatRow } from '@/components/ui/stat';
import { Accordion } from '@/components/ui/accordion';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Pay-as-you-go pricing for virtual verification numbers — no subscriptions. See live per-service, per-country rates for WhatsApp, Telegram, Instagram, and more.',
  alternates: { canonical: '/pricing' },
};

const SAMPLE = [
  ['WhatsApp', '🇮🇩 Indonesia', '$0.103'],
  ['Telegram', '🇮🇩 Indonesia', '$0.048'],
  ['Instagram', '🇮🇩 Indonesia', '$0.012'],
  ['Facebook', '🇮🇩 Indonesia', '$0.013'],
  ['TikTok', '🇮🇩 Indonesia', '$0.004'],
  ['Discord', '🇧🇷 Brazil', '$0.004'],
  ['Google', '🇵🇭 Philippines', '$0.010'],
  ['WeChat', '🇮🇩 Indonesia', '$0.007'],
];

const COMPARE = [
  ['Pricing model', 'Pay per number, no subscription', 'Pay per number or subscription'],
  ['Refund policy', 'Automatic, instant', 'Manual or delayed'],
  ['API', 'REST with Bearer auth', 'Query-string or basic'],
  ['Min. deposit', 'From $0.50', '$1–$5 typical'],
  ['Dashboard', 'Modern, mobile-friendly', 'Often dated'],
];

const FAQ = [
  {
    q: 'Is there a subscription or monthly fee?',
    a: 'No. You deposit funds and spend them per number. No recurring charges, no minimums.',
  },
  {
    q: "What happens if I don't receive an OTP?",
    a: 'When the 20-minute window expires without a delivered SMS, your balance is refunded automatically.',
  },
  {
    q: 'What is the minimum deposit?',
    a: 'You can deposit as little as $0.50 and start verifying immediately.',
  },
  {
    q: 'What currency are prices in?',
    a: 'All prices are shown in USD. Balances are stored to sub-cent precision.',
  },
];

export default function PricingPage() {
  return (
    <>
      <Container size="wide" className="pt-16 pb-8 text-center sm:pt-24">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">Pricing</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">
          Pay per number. No subscriptions, no hidden fees. Top up your balance and use it
          across any country and service.
        </p>
        <div className="mt-12">
          <StatRow
            stats={[
              { value: '200+', label: 'Countries' },
              { value: '1,200+', label: 'Services' },
              { value: '$0.004', label: 'Starting from' },
              { value: '$0.50', label: 'Min deposit' },
            ]}
          />
        </div>
      </Container>

      <Section className="pt-4">
        <Container size="narrow">
          <Card className="p-6 text-sm leading-relaxed text-muted">
            SMSGecko uses a simple pay-per-number pricing model. Instead of monthly subscriptions,
            you deposit funds and spend them on individual virtual numbers as needed. Each number
            has a fixed, upfront price that varies by country and platform. When you purchase a
            number you have a 20-minute window to receive an SMS. If no SMS arrives, your balance
            is automatically refunded.
          </Card>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="wide">
          <SectionHeading>Sample Pricing</SectionHeading>
          <Card className="mt-8 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 text-right font-medium">From</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE.map(([service, country, price]) => (
                  <tr key={`${service}-${country}`} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium">{service}</td>
                    <td className="px-5 py-3 text-muted">{country}</td>
                    <td className="px-5 py-3 text-right font-mono text-accent">{price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-xs text-faint">
            Prices vary by country and service. Sign up to see the full catalog with real-time
            availability.
          </p>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="wide">
          <SectionHeading>How We Compare</SectionHeading>
          <Card className="mt-8 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                  <th className="px-5 py-3 font-medium">Feature</th>
                  <th className="px-5 py-3 font-medium text-accent">SMSGecko</th>
                  <th className="px-5 py-3 font-medium">Most competitors</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([feature, us, them]) => (
                  <tr key={feature} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium">{feature}</td>
                    <td className="px-5 py-3 text-text">{us}</td>
                    <td className="px-5 py-3 text-muted">{them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="wide">
          <SectionHeading>Payment Methods</SectionHeading>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ['Mock wallet', 'Instant confirm in development — no real charge.'],
              ['QRIS', 'Scan-and-pay simulation for the deposit flow.'],
              ['Cryptocurrency', 'Simulated USDT address with a webhook confirm.'],
            ].map(([title, body]) => (
              <Card key={title} className="p-6">
                <div className="font-display text-base font-semibold">{title}</div>
                <p className="mt-2 text-sm text-muted">{body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="narrow">
          <SectionHeading className="text-center">Frequently Asked Questions</SectionHeading>
          <div className="mt-10">
            <Accordion items={FAQ} />
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="wide">
          <Card className="p-10 text-center">
            <SectionHeading className="justify-center">Ready to start?</SectionHeading>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted">
              Create an account and start verifying in minutes. No credit card required.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/register" size="lg">
                Sign Up Free
              </Button>
              <Button href="/docs" variant="secondary" size="lg">
                View API Docs
              </Button>
            </div>
          </Card>
        </Container>
      </Section>
    </>
  );
}
