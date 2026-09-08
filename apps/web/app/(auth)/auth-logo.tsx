import Link from 'next/link';

/** SMSGecko mark shown at the top of the auth card. */
export function AuthLogo() {
  return (
    <Link href="/" className="auth-logo" aria-label="SMSGecko home">
      {/* stylised speech-bubble mark — same glyph as the site logo */}
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2 5.5A3.5 3.5 0 0 1 5.5 2h5A3.5 3.5 0 0 1 14 5.5v3A3.5 3.5 0 0 1 10.5 12H7l-3.2 2.4A.5.5 0 0 1 3 14v-2.2A3.5 3.5 0 0 1 2 8.5v-3Z"
          fill="currentColor"
        />
      </svg>
    </Link>
  );
}
