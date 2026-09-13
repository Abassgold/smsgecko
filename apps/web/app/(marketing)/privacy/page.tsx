import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What SMSGecko collects and why.',
  alternates: { canonical: '/privacy' },
  robots: { index: false, follow: true },
};

const LAST_UPDATED = 'September 13, 2026';

export default function PrivacyPage() {
  return (
    <Section className="pt-16 sm:pt-24">
      <Container size="narrow">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">Privacy Policy</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          This is a demo/portfolio project, not a real company — this page describes what the
          codebase actually stores and sends, written the way a real product&apos;s privacy
          policy would be.
        </p>
        <p className="mt-2 text-xs text-faint">Last updated {LAST_UPDATED}</p>

        <div className="mt-10 flex flex-col gap-8 text-[15px] leading-relaxed text-muted">
          <section>
            <h2 className="font-display text-xl font-bold text-text">1. What we collect</h2>
            <ul className="mt-3 flex flex-col gap-2 list-disc pl-5">
              <li>
                <strong className="text-text">Account data</strong> — email, username, and a
                salted/hashed password (we never store the password itself).
              </li>
              <li>
                <strong className="text-text">Order &amp; transaction history</strong> — every
                number rented, its price, status, and the wallet transactions that funded it.
              </li>
              <li>
                <strong className="text-text">SMS content</strong> — the text of messages
                delivered to a number you rented, so we can extract the OTP and show it to you.
                This is content sent by a third-party platform to a virtual number, not a
                message from your own device.
              </li>
              <li>
                <strong className="text-text">Session metadata</strong> — the IP address and
                user-agent string recorded against each login session, for security and abuse
                detection.
              </li>
              <li>
                <strong className="text-text">Optional data you provide</strong> — a webhook URL
                and secret if you configure one, an API key label, and (for the affiliate
                program) which referral code brought a new signup in.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">2. Cookies</h2>
            <p className="mt-3">
              We set two httpOnly cookies to keep you signed in: a short-lived access token and a
              longer-lived refresh token used to mint new ones. Neither is readable by JavaScript.
              We don&apos;t use analytics or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">3. Who we share it with</h2>
            <p className="mt-3">
              We don&apos;t sell your data. It&apos;s shared only where the product requires it:
            </p>
            <ul className="mt-3 flex flex-col gap-2 list-disc pl-5">
              <li>
                <strong className="text-text">SMS providers</strong> — to actually rent a number,
                the service/country you request is sent to whichever upstream provider fulfills
                it. They see the order, not your account email.
              </li>
              <li>
                <strong className="text-text">Resend</strong> — sends verification and
                password-reset emails on our behalf.
              </li>
              <li>
                <strong className="text-text">Your own webhook endpoint</strong> — if you
                configure one, we POST your own order events to the URL you gave us.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">4. Retention</h2>
            <p className="mt-3">
              Order, transaction, and SMS records are kept for as long as your account exists, so
              your history and balance stay accurate. Password-reset and email-verification links
              expire quickly and are deleted automatically once used or expired.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">5. Your choices</h2>
            <p className="mt-3">
              You can change your password, rotate or revoke API keys, and clear your webhook
              configuration at any time from{' '}
              <Link href="/settings" className="text-accent">
                Settings
              </Link>
              . To ask about deleting your account data, use the{' '}
              <Link href="/contact" className="text-accent">
                contact page
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">6. Changes</h2>
            <p className="mt-3">
              We may update this policy as the product changes. Material changes will update the
              date at the top of this page. See also our{' '}
              <Link href="/terms" className="text-accent">
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </div>
      </Container>
    </Section>
  );
}
