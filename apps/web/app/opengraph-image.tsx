import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Default social-share card for every page that doesn't define its own.
// Mirrors the home page hero: dark ground, accent gecko mark, wordmark, tagline.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #07090b 0%, #0b0f0d 60%, #0a1410 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 96,
            height: 96,
            borderRadius: 24,
            background: 'rgba(53, 208, 127, 0.14)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 36,
          }}
        >
          <svg width="52" height="52" viewBox="0 0 64 64" fill="none">
            <path d="M32 5 C36.5 5 39 9 38.5 14 C38 19 35.5 22.5 32 22.5 C28.5 22.5 26 19 25.5 14 C25 9 27.5 5 32 5 Z" fill="#35d07f" />
          <ellipse cx="32" cy="34" rx="9" ry="12.5" fill="#35d07f" />
          <path d="M24 26 C18 24 14 21 11 18" stroke="#35d07f" strokeWidth="4" strokeLinecap="round" />
          <path d="M40 26 C46 24 50 21 53 18" stroke="#35d07f" strokeWidth="4" strokeLinecap="round" />
          <path d="M24 41 C18 43 14 47 11 51" stroke="#35d07f" strokeWidth="4" strokeLinecap="round" />
          <path d="M40 41 C46 43 50 47 53 51" stroke="#35d07f" strokeWidth="4" strokeLinecap="round" />
          <path d="M31 46 C39 55 52 53 52 41 C52 34 44 33 44.5 41" stroke="#35d07f" strokeWidth="5" strokeLinecap="round" />
          <path d="M11 18 L8 14" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M11 18 L7 18" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M11 18 L9 22" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M53 18 L56 14" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M53 18 L57 18" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M53 18 L55 22" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M11 51 L8 55" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M11 51 L7 51" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M11 51 L9 47" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M53 51 L56 55" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M53 51 L57 51" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M53 51 L55 47" stroke="#35d07f" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="28.6" cy="12.5" r="2" fill="#04130b" />
          <circle cx="35.4" cy="12.5" r="2" fill="#04130b" />

          </svg>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 84,
            fontWeight: 700,
            color: '#f4f7fa',
            letterSpacing: -2,
          }}
        >
          smsgecko
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 20,
            fontSize: 30,
            fontWeight: 700,
            color: '#35d07f',
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          Catch every verification code.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 22,
            fontSize: 24,
            color: '#8b98ac',
          }}
        >
          Virtual numbers for OTP &amp; verification — 200+ countries, 1,000+ platforms
        </div>
      </div>
    ),
    { ...size },
  );
}
