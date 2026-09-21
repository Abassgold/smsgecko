import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Logo } from './logo';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Virtual Numbers', href: '/' },
      { label: 'SMS Verification', href: '/' },
      { label: 'Platforms', href: '/platforms' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'API Docs', href: '/docs' },
      { label: 'Use Cases', href: '/faq' },
      { label: 'Status', href: '/' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-14">
      <Container size="wide">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Buy virtual numbers to receive SMS online for OTP &amp; verification. Fast
              activation, real SIM numbers, global coverage.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[11px] uppercase tracking-widest text-faint">{col.title}</h4>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="hover:text-text">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6 text-xs text-faint">
          © {new Date().getFullYear()} SMSGecko. All rights reserved.
        </div>
      </Container>
    </footer>
  );
}
