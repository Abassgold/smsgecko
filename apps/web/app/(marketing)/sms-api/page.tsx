import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { Accordion, type QA } from '@/components/ui/accordion';
import { QUICK_START, V2_QUICK_START } from '@/components/marketing/content';
import { JsonLd, SITE_URL, breadcrumbLd, faqLd } from '@/components/marketing/seo';

const PATH = '/sms-api';
const DESCRIPTION =
  'SMS verification API for developers and resellers: rent virtual numbers, receive OTP codes by polling or signed webhooks, automatic refunds. SMS-Activate-compatible plus a REST API.';

export const metadata: Metadata = {
  title: 'SMS Verification API: Virtual Numbers for OTP Codes',
  description: DESCRIPTION,
  keywords: ['SMS verification API', 'virtual number API', 'OTP API', 'SMS activation API', 'receive SMS API', 'SMS-Activate compatible API', 'phone verification API'],
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: 'SMS Verification API — SMSGecko', description: DESCRIPTION },
};

const ENDPOINT = `${SITE_URL}/stubs/handler_api.php`;

const FEATURES: Array<[string, string]> = [
  ['SMS-Activate-compatible', 'The same handler_api.php protocol (getNumber, getStatus, setStatus, getPrices…). Tools built for it work by changing the host and API key.'],
  ['A modern REST API too', 'JSON endpoints under /api/v2 with Bearer auth and idempotency keys, for new integrations.'],
  ['Signed webhooks', 'Set an HTTPS URL and we POST each code as it arrives, signed with HMAC-SHA256 (X-SMSGecko-Signature) and retried up to 5 more times.'],
  ['Automatic refunds', 'No SMS inside the order window? The order is canceled and your balance is returned automatically.'],
  ['Price control', 'Cap each purchase with maxPrice, or buy an exact price tier listed by getPricesV2.'],
  ['800+ services, 190+ countries', 'WhatsApp, Telegram, Google, Discord, TikTok, OpenAI and many more. getServicesList and getCountries return the live catalogue.'],
];

const FAQS: QA[] = [
  { q: 'What is an SMS verification API?', a: 'It lets your software rent a phone number, read the one-time code (OTP) a service sends to it, and release the number without anyone doing it by hand. Bots, account tools and reseller sites use it to verify accounts at scale.' },
  { q: 'Is SMSGecko compatible with SMS-Activate?', a: 'Yes, for the core methods: getBalance, getNumber, getNumberV2, getStatus, getStatusV2, setStatus, getActiveActivations, getPrices, getPricesV2, getServicesList and getCountries, at /stubs/handler_api.php. Most tools only need a new host and API key. Other methods are not supported yet.' },
  { q: 'Which API should I use, handler_api or REST v2?', a: 'Use handler_api.php if you already have an SMS-Activate-style tool. For new code, the REST API under /api/v2 gives JSON responses, Bearer auth and idempotency keys.' },
  { q: 'Do I pay if no SMS arrives?', a: 'No. If nothing arrives inside the order window the order is refunded to your balance automatically, and you can cancel earlier with setStatus=8.' },
  { q: 'Can I receive codes by webhook?', a: 'Yes. Set an HTTPS webhook URL and we POST each code as it arrives with an HMAC-SHA256 signature in X-SMSGecko-Signature. Deliveries that do not get a 2xx are retried up to 5 more times.' },
  { q: 'What does the API cost?', a: 'There is no subscription or API fee. You pay the per-number price, in USD, from the same balance you use on the website.' },
];

export default function SmsApiPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([['SMS API', PATH]]),
          { '@context': 'https://schema.org', '@type': 'WebAPI', name: 'SMSGecko SMS Verification API', description: DESCRIPTION, url: `${SITE_URL}${PATH}`, documentation: `${SITE_URL}/docs`, provider: { '@type': 'Organization', name: 'SMSGecko', url: SITE_URL } },
          faqLd(FAQS),
        ]}
      />
      <Container size="wide" className="pt-16 pb-8 text-center sm:pt-24">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          SMS verification <span className="text-gradient">API</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] text-muted">
          Rent virtual numbers and receive OTP codes from your own code. SMS-Activate-compatible, with a REST API, signed webhooks and automatic refunds.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href="/register" size="lg">Get your API key</Button>
          <Button href="/docs" size="lg" variant="outline">Read the API docs</Button>
        </div>
      </Container>

      <Section className="pt-4">
        <Container>
          <h2 className="font-display text-2xl font-bold">Why developers use SMSGecko</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <h2 className="font-display text-2xl font-bold">How it works in three calls</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-muted">
            <li><b className="text-text">getNumber</b> rents a number for a service and country and returns an activation id and the phone number.</li>
            <li>Enter the number on the service. <b className="text-text">getStatus</b> returns <code className="font-mono">STATUS_OK:&lt;code&gt;</code> once the SMS arrives (or your webhook receives it).</li>
            <li><b className="text-text">setStatus</b> finishes the activation (6), asks for another SMS (3) or cancels it for a refund (8).</li>
          </ol>
          <p className="mt-4 text-sm text-muted">Endpoint: <code className="font-mono text-text">{ENDPOINT}</code></p>
          <div className="mt-6"><CodeBlock title="SMS-Activate-compatible quick start" tabs={QUICK_START} /></div>
          <div className="mt-6"><CodeBlock title="REST API (v2) quick start" tabs={V2_QUICK_START} /></div>
        </Container>
      </Section>

      <Section>
        <Container size="narrow">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-xl font-bold">Moving from SMS-Activate or a similar service?</h2>
            <p className="mt-2 text-[15px] text-muted">
              Point your tool at <code className="font-mono text-text">{ENDPOINT}</code> and paste your SMSGecko key.{' '}
              <Link href="/sms-activate-alternative" className="font-semibold text-accent hover:underline">Read the migration guide</Link>.
            </p>
          </div>
          <h2 className="mt-12 font-display text-2xl font-bold">Frequently asked questions</h2>
          <div className="mt-6"><Accordion items={FAQS} /></div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button href="/register" size="lg">Create a free account</Button>
            <Button href="/docs" size="lg" variant="outline">API reference</Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
