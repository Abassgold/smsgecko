/**
 * The SMSGecko gecko mark — a top-down climbing gecko (tapered head with eyes,
 * four splayed toed legs, a curling tail). Drop it inside an
 * `<svg viewBox="0 0 64 64" fill="none">` so the wrapper controls size/colour.
 *
 * `color` paints the body/legs/tail (defaults to `currentColor` so a parent's
 * text colour drives it); `eyeColor` is the eye cut-out (defaults to the badge
 * background token). Pass explicit hex values when rendering outside the DOM
 * (e.g. Next `ImageResponse`, which can't resolve `currentColor` / CSS vars).
 */
export function GeckoGlyph({
  color = 'currentColor',
  eyeColor = 'var(--accent-contrast)',
}: {
  color?: string;
  eyeColor?: string;
}) {
  return (
    <>
      {/* head */}
      <path
        d="M32 5 C36.5 5 39 9 38.5 14 C38 19 35.5 22.5 32 22.5 C28.5 22.5 26 19 25.5 14 C25 9 27.5 5 32 5 Z"
        fill={color}
      />
      {/* body */}
      <ellipse cx="32" cy="34" rx="9" ry="12.5" fill={color} />
      {/* legs */}
      <g stroke={color} strokeWidth="4" strokeLinecap="round">
        <path d="M24 26 C18 24 14 21 11 18" />
        <path d="M40 26 C46 24 50 21 53 18" />
        <path d="M24 41 C18 43 14 47 11 51" />
        <path d="M40 41 C46 43 50 47 53 51" />
      </g>
      {/* tail */}
      <path
        d="M31 46 C39 55 52 53 52 41 C52 34 44 33 44.5 41"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* toes */}
      <g stroke={color} strokeWidth="2.2" strokeLinecap="round">
        <path d="M11 18 L8 14" />
        <path d="M11 18 L7 18" />
        <path d="M11 18 L9 22" />
        <path d="M53 18 L56 14" />
        <path d="M53 18 L57 18" />
        <path d="M53 18 L55 22" />
        <path d="M11 51 L8 55" />
        <path d="M11 51 L7 51" />
        <path d="M11 51 L9 47" />
        <path d="M53 51 L56 55" />
        <path d="M53 51 L57 51" />
        <path d="M53 51 L55 47" />
      </g>
      {/* eyes */}
      <circle cx="28.6" cy="12.5" r="2" fill={eyeColor} />
      <circle cx="35.4" cy="12.5" r="2" fill={eyeColor} />
    </>
  );
}
