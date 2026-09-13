import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern using SMSGecko.',
  alternates: { canonical: '/terms' },
  robots: { index: false, follow: true },
};

const LAST_UPDATED = 'September 13, 2026';

export default function TermsPage() {
  return (
    <Section className="pt-16 sm:pt-24">
      <Container size="narrow">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          <span className="text-gradient">Terms of Service</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          This is a demo/portfolio project, not a real company — no real SMS is sent and no real
          payments are processed. These terms are written the way a real product&apos;s would be,
          for practice, and describe how the site actually behaves.
        </p>
        <p className="mt-2 text-xs text-faint">Last updated {LAST_UPDATED}</p>

        <div className="mt-10 flex flex-col gap-8 text-[15px] leading-relaxed text-muted">
          <section>
            <h2 className="font-display text-xl font-bold text-text">1. What SMSGecko is</h2>
            <p className="mt-3">
              SMSGecko lets an account holder rent a virtual phone number for a short window to
              receive one SMS — typically an OTP or verification code from a third-party
              platform — via the dashboard or the{' '}
              <Link href="/docs" className="text-accent">
                REST API
              </Link>
              . Numbers are shared infrastructure: they are not assigned to you personally, are
              reused after your order resolves, and should not be treated as a phone number you
              can be reached at outside of that one order.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">2. Accounts</h2>
            <p className="mt-3">
              You need an account to buy a number. You&apos;re responsible for the activity on
              it, including anything done with an API key you generate. Keep your password and
              API keys private — anyone who has either can spend your balance. Verify your email
              address; some actions are gated on it.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">3. Balance, pricing, and refunds</h2>
            <p className="mt-3">
              The account balance is a prepaid wallet, spent per order at the price shown at
              purchase time. There is no subscription. If no SMS arrives before an order&apos;s
              window closes, it is refunded automatically. Once a message is delivered to the
              number, the order is billable — even if a code could not be parsed out of it — since
              the number and the delivery window were still consumed.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">4. Acceptable use</h2>
            <p className="mt-3">You agree not to use SMSGecko to:</p>
            <ul className="mt-3 flex flex-col gap-2 list-disc pl-5">
              <li>Verify accounts for fraud, spam, harassment, or any illegal purpose.</li>
              <li>
                Attempt to circumvent a platform&apos;s own terms of service through automated,
                bulk account creation at a scale that platform doesn&apos;t permit.
              </li>
              <li>
                Abuse the API — bypass rate limits, replay idempotency keys to trigger duplicate
                effects, or probe the service for vulnerabilities without authorization.
              </li>
              <li>Resell access to your account or API keys to a third party.</li>
            </ul>
            <p className="mt-3">
              We can suspend an account that violates this, refunding any unresolved balance at
              our discretion.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">5. Webhooks and API keys</h2>
            <p className="mt-3">
              If you configure a webhook URL, we&apos;ll POST order events to it and sign each
              request with your webhook secret — verify that signature before trusting a payload.
              You&apos;re responsible for keeping your endpoint able to receive these deliveries;
              we make a best-effort single attempt and don&apos;t retry or queue failed ones.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">6. Availability</h2>
            <p className="mt-3">
              Numbers are sourced from upstream SMS providers whose stock and reliability we
              don&apos;t control. We don&apos;t guarantee a given service/country will have
              stock, or that a delivered code will always be parseable. We also reserve the right
              to run maintenance windows during which new orders are paused.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">7. Changes</h2>
            <p className="mt-3">
              We may update these terms as the product changes. Material changes will update the
              date at the top of this page.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-text">8. Contact</h2>
            <p className="mt-3">
              Questions about these terms go through the{' '}
              <Link href="/contact" className="text-accent">
                contact page
              </Link>
              . See also our{' '}
              <Link href="/privacy" className="text-accent">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </Container>
    </Section>
  );
}
