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
            <path
              d="M32,50 C34,58 42,60 47,55 C52,50 49,42 43,44"
              stroke="#35d07f"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path d="M27,33 C19,32 11,29 5,25" stroke="#35d07f" strokeWidth="6" strokeLinecap="round" />
            <path d="M37,33 C45,32 53,29 59,25" stroke="#35d07f" strokeWidth="6" strokeLinecap="round" />
            <path d="M25,45 C17,47 9,49 3,52" stroke="#35d07f" strokeWidth="6" strokeLinecap="round" />
            <path d="M39,45 C47,47 55,49 61,52" stroke="#35d07f" strokeWidth="6" strokeLinecap="round" />
            <path
              d="M32,8 C36,8 39,11 39,15 C39,17.5 38,19.5 36,21 C42,24 47,33 47,42 C47,49 40,55 32,55 C24,55 17,49 17,42 C17,33 22,24 28,21 C26,19.5 25,17.5 25,15 C25,11 28,8 32,8 Z"
              fill="#35d07f"
            />
            <circle cx="28" cy="16" r="1.8" fill="#04130b" />
            <circle cx="36" cy="16" r="1.8" fill="#04130b" />
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
