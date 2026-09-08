import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Accordion, type QA } from '@/components/ui/accordion';
import { FAQ } from '@/components/marketing/content';

export const metadata: Metadata = { title: 'FAQ' };

const MORE: QA[] = [
  {
    q: 'Is a delivered SMS always billable?',
    a: 'Yes. If a message is delivered to your number it counts as a successful verification, even if no OTP code could be extracted from it. Only orders that receive nothing before the window closes are refunded.',
  },
  {
    q: 'Can I use one balance across countries and services?',
    a: 'Yes. Your balance is a single wallet spendable on any country/service combination in the catalog.',
  },
  {
    q: 'Do you offer an API?',
    a: 'Yes — a REST API under /api/v2 with Bearer authentication, idempotency keys, and endpoints to create orders, poll for the OTP, and finish or cancel an order.',
  },
  {
    q: 'How long do I have to receive a code?',
    a: 'Each order has a fixed window (20 minutes on the live service). A countdown is shown on the order page; when it hits zero an un-delivered order is refunded automatically.',
  },
];

export default function FaqPage() {
  return (
    <>
      <Container size="wide" className="pt-16 pb-8 text-center sm:pt-24">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">FAQ</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">
          Everything about numbers, OTP delivery, refunds, and the API.
        </p>
      </Container>

      <Section className="pt-4">
        <Container size="narrow">
          <Accordion items={[...FAQ, ...MORE]} />
        </Container>
      </Section>
    </>
  );
}
