import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Section, SectionHeading } from '@/components/ui/section';
import { Card } from '@/components/ui/card';
import { CheckCircleIcon } from '@/components/ui/icons';
import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the SMSGecko team, or find answers in the FAQ and API docs.',
  alternates: { canonical: '/contact' },
};

const BEFORE_YOU_REACH_OUT = [
  {
    href: '/faq',
    icon: QuestionIcon,
    title: 'Check the FAQ',
    body: 'Most common questions about accounts, payments, orders, and the API are answered there.',
  },
  {
    href: '/docs',
    icon: CodeIcon,
    title: 'Read the API Docs',
    body: 'Integration issues or error codes? The full endpoint reference and examples are in the docs.',
    highlight: true,
  },
  {
    href: '/pricing',
    icon: DollarIcon,
    title: 'Review Pricing',
    body: 'Questions about cost? Check the pricing page for live rates and payment methods.',
  },
];

const OTHER_WAYS = [
  {
    href: 'mailto:support@smsgecko.com',
    icon: MailIcon,
    title: 'Email Support',
    body: 'support@smsgecko.com',
  },
  {
    href: 'https://t.me/smsgecko_support',
    icon: TelegramIcon,
    title: 'Telegram Support',
    body: '@smsgecko_support',
  },
];

const WHAT_TO_EXPECT = [
  {
    icon: ClockIcon,
    title: 'A real reply',
    body: 'We reply directly to the email address you provide in the form below.',
  },
  {
    icon: ShieldIcon,
    title: 'Auto-refunds',
    body: 'Expired orders with no SMS delivery are refunded automatically — no need to contact us for that.',
  },
];

const CHECKLIST = [
  ['account email', 'or username'],
  ['order ID', 'if the question is about a specific order'],
  ['a clear description', 'of the issue and what you expected'],
  ['screenshots', 'or API error responses, if relevant'],
];

export default function ContactPage() {
  return (
    <>
      <Section className="pt-16 pb-8 text-center sm:pt-24">
        <Container size="narrow">
          <h1 className="font-display text-4xl font-bold sm:text-5xl">
            <span className="text-gradient">Contact Us</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">
            Have a question or need help? Check the resources below first — for anything else,
            send us a message.
          </p>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="narrow">
          <SectionHeading>Before You Reach Out</SectionHeading>
          <div className="mt-8 flex flex-col gap-3">
            {BEFORE_YOU_REACH_OUT.map(({ href, icon: Icon, title, body, highlight }) => (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-4 rounded-2xl border p-5 transition-colors ${
                  highlight
                    ? 'border-accent/40 bg-accent-soft'
                    : 'border-border bg-surface/60 hover:border-border-strong'
                }`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent">
                  <Icon />
                </span>
                <span className="flex-1">
                  <span className="block font-display text-[15px] font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{body}</span>
                </span>
                <ArrowIcon className="text-faint transition-transform group-hover:translate-x-1 group-hover:text-accent" />
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="narrow">
          <SectionHeading>Other Ways to Reach Us</SectionHeading>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {OTHER_WAYS.map(({ href, icon: Icon, title, body }) => (
              <a
                key={href}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-surface/60 p-5 transition-colors hover:border-border-strong"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent">
                  <Icon />
                </span>
                <span className="flex-1">
                  <span className="block font-display text-[15px] font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{body}</span>
                </span>
                <ArrowIcon className="text-faint transition-transform group-hover:translate-x-1 group-hover:text-accent" />
              </a>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="narrow">
          <SectionHeading>What to Expect</SectionHeading>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {WHAT_TO_EXPECT.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="p-6 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon />
                </span>
                <div className="mt-4 font-display text-base font-semibold">{title}</div>
                <p className="mt-2 text-sm text-muted">{body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="narrow">
          <SectionHeading>Help Us Help You Faster</SectionHeading>
          <Card className="mt-8 p-6">
            <p className="text-sm text-muted">When you send a message, please include:</p>
            <ul className="mt-4 flex flex-col gap-3">
              {CHECKLIST.map(([bold, rest]) => (
                <li key={bold} className="flex items-start gap-2.5 text-sm text-muted">
                  <CheckCircleIcon className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    <span className="font-semibold text-text">{bold}</span> {rest}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container size="narrow">
          <SectionHeading>Send a Message</SectionHeading>
          <ContactForm />
        </Container>
      </Section>
    </>
  );
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
