import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Default social-share card for every page that doesn't define its own.
// Mirrors the home page hero: dark ground, accent speech-bubble mark,
// wordmark, tagline.
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
          <svg width="46" height="46" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 5.5A3.5 3.5 0 0 1 5.5 2h5A3.5 3.5 0 0 1 14 5.5v3A3.5 3.5 0 0 1 10.5 12H7l-3.2 2.4A.5.5 0 0 1 3 14v-2.2A3.5 3.5 0 0 1 2 8.5v-3Z"
              fill="#35d07f"
            />
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
