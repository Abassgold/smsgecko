import { ImageResponse } from 'next/og';

export const size = { width: 48, height: 48 };
export const contentType = 'image/png';

// Favicon — same speech-bubble mark as the header Logo component, generated
// at build/request time so there's no binary asset to keep in sync by hand.
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
        <svg width="30" height="30" viewBox="0 0 16 16" fill="none">
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
