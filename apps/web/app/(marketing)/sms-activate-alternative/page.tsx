import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { Accordion, type QA } from '@/components/ui/accordion';
import { JsonLd, SITE_URL, breadcrumbLd, faqLd } from '@/components/marketing/seo';

const PATH = '/sms-activate-alternative';
const DESCRIPTION =
  'Looking for an SMS-Activate alternative? SMSGecko speaks the same handler_api.php protocol: switch your bot or tool by changing the host and API key. Webhooks and automatic refunds included.';

export const metadata: Metadata = {
  title: 'SMS-Activate Alternative with a Compatible API',
  description: DESCRIPTION,
  keywords: ['SMS-Activate alternative', 'sms activate alternative API', 'handler_api.php', 'SMS activation service', 'SMS-Activate compatible'],
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: 'SMS-Activate Alternative — SMSGecko', description: DESCRIPTION },
};

const ENDPOINT = `${SITE_URL}/stubs/handler_api.php`;

const METHODS: Array<[string, string]> = [
  ['getBalance', 'Your balance in USD'],
  ['getNumber / getNumberV2', 'Rent a number for a service and country'],
  ['getStatus / getStatusV2', 'Read the SMS code'],
  ['setStatus', 'Finish (6), request another SMS (3) or cancel and refund (8)'],
  ['getActiveActivations', 'Your numbers that are still waiting'],
  ['getPrices / getPricesV2', 'Live prices and price tiers'],
  ['getServicesList / getCountries', 'Service codes and country ids'],
];

const FAQS: QA[] = [
  { q: 'Is SMSGecko affiliated with SMS-Activate?', a: 'No. SMSGecko is an independent service. We support the same widely used handler_api.php request format so tools written for it can work with us too.' },
  { q: 'Which SMS-Activate methods are supported?', a: 'getBalance, getNumber, getNumberV2, getStatus, getStatusV2, setStatus, getActiveActivations, getPrices, getPricesV2, getServicesList and getCountries. Other methods are not supported yet.' },
  { q: 'Do I need to change service codes or country ids?', a: 'Usually not: common service codes (wa, tg, go, ...) and numeric country ids such as 187 for the United States work as expected. getServicesList and getCountries list them all.' },
  { q: 'What happens to my money if a number gets no SMS?', a: 'It is refunded to your balance automatically when the order window closes, or straight away if you cancel with setStatus=8.' },
];

export default function SmsActivateAlternativePage() {
  return (
    <>
      <JsonLd data={[breadcrumbLd([['SMS API', '/sms-api'], ['SMS-Activate alternative', PATH]]), faqLd(FAQS)]} />
      <Container size="wide" className="pt-16 pb-8 text-center sm:pt-24">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          An <span className="text-gradient">SMS-Activate alternative</span> your tools already understand
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] text-muted">
          SMSGecko uses the same handler_api.php protocol, so most bots, scripts and reseller panels switch by changing two things: the host and the API key.
        </p>
      </Container>

      <Section className="pt-4">
        <Container size="narrow">
          <h2 className="font-display text-2xl font-bold">Switch in three steps</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-muted">
            <li><Link href="/register" className="font-semibold text-accent hover:underline">Create a free SMSGecko account</Link> and add funds.</li>
            <li>Copy your API key from your account settings.</li>
            <li>In your tool, replace the old host with <code className="font-mono text-text">{ENDPOINT}</code> and paste the new key.</li>
          </ol>
          <div className="mt-6">
            <CodeBlock
              title="Before and after"
              tabs={[{ label: 'URL', language: 'bash', code: `# before (your previous provider)\nhttps://<old-provider-host>/stubs/handler_api.php?action=getNumber&service=wa&country=187&api_key=OLD_KEY\n\n# after (SMSGecko): same path, same parameters\n${ENDPOINT}?action=getNumber&service=wa&country=187&api_key=YOUR_SMSGECKO_KEY` }]}
            />
          </div>

          <h2 className="mt-12 font-display text-2xl font-bold">Supported methods</h2>
          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-muted"><tr><th className="px-4 py-2.5 font-semibold">Method</th><th className="px-4 py-2.5 font-semibold">What it does</th></tr></thead>
              <tbody className="divide-y divide-border">
                {METHODS.map(([m, d]) => (
                  <tr key={m}><td className="px-4 py-2.5 font-mono font-semibold">{m}</td><td className="px-4 py-2.5 text-muted">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted">Full parameters and replies: <Link href="/docs" className="font-semibold text-accent hover:underline">API docs</Link>.</p>

          <h2 className="mt-12 font-display text-2xl font-bold">What you get on top</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] text-muted">
            <li><b className="text-text">Signed webhooks:</b> codes pushed to your HTTPS URL, HMAC-SHA256 signed, retried if you are offline.</li>
            <li><b className="text-text">Automatic refunds</b> when no SMS arrives.</li>
            <li><b className="text-text">A REST API (v2)</b> with JSON, Bearer auth and idempotency keys when you are ready to move on from handler_api.</li>
          </ul>

          <h2 className="mt-12 font-display text-2xl font-bold">Frequently asked questions</h2>
          <div className="mt-6"><Accordion items={FAQS} /></div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button href="/register" size="lg">Get your API key</Button>
            <Button href="/sms-api" size="lg" variant="outline">About the SMS API</Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
