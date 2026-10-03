import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// iOS home-screen icon — same mark as icon.tsx, scaled up. iOS applies its
// own corner rounding, so this ships as a plain filled square.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#07090b',
        }}
      >
        <svg width="104" height="104" viewBox="0 0 64 64" fill="none">
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
    ),
    { ...size },
  );
}
