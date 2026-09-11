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
        <svg width="104" height="104" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 5.5A3.5 3.5 0 0 1 5.5 2h5A3.5 3.5 0 0 1 14 5.5v3A3.5 3.5 0 0 1 10.5 12H7l-3.2 2.4A.5.5 0 0 1 3 14v-2.2A3.5 3.5 0 0 1 2 8.5v-3Z"
            fill="#35d07f"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
