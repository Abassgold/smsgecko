let names: Intl.DisplayNames | null = null;

/** "NG" → "🇳🇬 Nigeria"; null/"unknown" → "Unknown". */
export function countryLabel(code: string | null | undefined, withName = true): string {
  if (!code || code === 'unknown' || !/^[A-Z]{2}$/.test(code)) return 'Unknown';
  const flag = String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  if (!withName) return `${flag} ${code}`;
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return `${flag} ${names.of(code) ?? code}`;
  } catch {
    return `${flag} ${code}`;
  }
}
