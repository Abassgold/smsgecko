import Link from 'next/link';
import { GeckoGlyph } from '@/components/marketing/gecko-mark';

/** SMSGecko mark shown at the top of the auth card. */
export function AuthLogo() {
  return (
    <Link href="/" className="auth-logo" aria-label="SMSGecko home">
      {/* gecko mark — same glyph as the site logo */}
      <svg viewBox="0 0 64 64" fill="none" aria-hidden>
        <GeckoGlyph />
      </svg>
    </Link>
  );
}
