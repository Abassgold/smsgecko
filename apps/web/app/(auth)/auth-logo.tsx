import Link from 'next/link';

/** SMSGecko mark shown at the top of the auth card. */
export function AuthLogo() {
  return (
    <Link href="/" className="auth-logo" aria-label="SMSGecko home">
      {/* gecko mark — same glyph as the site logo */}
      <svg viewBox="0 0 64 64" fill="none" aria-hidden>
        <path
          d="M32,50 C34,58 42,60 47,55 C52,50 49,42 43,44"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M27,33 C19,32 11,29 5,25" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M37,33 C45,32 53,29 59,25" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M25,45 C17,47 9,49 3,52" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M39,45 C47,47 55,49 61,52" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M32,8 C36,8 39,11 39,15 C39,17.5 38,19.5 36,21 C42,24 47,33 47,42 C47,49 40,55 32,55 C24,55 17,49 17,42 C17,33 22,24 28,21 C26,19.5 25,17.5 25,15 C25,11 28,8 32,8 Z"
          fill="currentColor"
        />
        <circle cx="28" cy="16" r="1.8" fill="var(--accent-contrast)" />
        <circle cx="36" cy="16" r="1.8" fill="var(--accent-contrast)" />
      </svg>
    </Link>
  );
}
