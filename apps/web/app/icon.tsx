import { ImageResponse } from 'next/og';

export const size = { width: 48, height: 48 };
export const contentType = 'image/png';

// Favicon — same gecko mark as the header Logo component, generated at
// build/request time so there's no binary asset to keep in sync by hand.
// 48x48 (not 32x32): Google's search-result favicon guidance wants a size
// that's a multiple of 48px or it may decline to show one.
export default function Icon() {
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
          borderRadius: 10,
        }}
      >
        <svg width="30" height="30" viewBox="0 0 64 64" fill="none">
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
    ),
    { ...size },
  );
}
