import { getCountryCallingCode, isSupportedCountry } from 'libphonenumber-js';

/**
 * Best-effort ISO-2 + dial code for a country the provider only names in
 * English (the SMS-Activate clones' `getCountries` carries no ISO code). The
 * index is built from the runtime's own ISO 3166 region names, plus aliases for
 * the spellings resellers use that don't match them.
 */

function norm(name: string, keepParens = false): string {
  let s = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents: Côte -> Cote
    .toLowerCase();
  if (!keepParens) s = s.replace(/\(.*?\)/g, ' '); // "USA (virtual)"
  return s
    .replace(/&/g, ' and ')
    .replace(/\b(the|of|republic|rep|federation|islands?|st)\b\.?/g, ' ')
    .replace(/[^a-z]+/g, '');
}

/** Normalised reseller spelling -> ISO-2, for names ISO calls something else. */
const ALIASES: Record<string, string> = {
  usa: 'us',
  unitedstatesamerica: 'us',
  uk: 'gb',
  england: 'gb',
  greatbritain: 'gb',
  russia: 'ru',
  southkorea: 'kr',
  korea: 'kr',
  northkorea: 'kp',
  czech: 'cz',
  czechia: 'cz',
  ivorycoast: 'ci',
  cotedivoire: 'ci',
  capeverde: 'cv',
  swaziland: 'sz',
  eswatini: 'sz',
  burma: 'mm',
  macedonia: 'mk',
  northmacedonia: 'mk',
  laos: 'la',
  syria: 'sy',
  iran: 'ir',
  moldova: 'md',
  vietnam: 'vn',
  palestine: 'ps',
  macau: 'mo',
  macao: 'mo',
  hongkong: 'hk',
  taiwan: 'tw',
  bosniaherzegovina: 'ba',
  bosniaandherzegovina: 'ba',
  saintkittsandnevis: 'kn',
  kittsandnevis: 'kn',
  saintlucia: 'lc',
  lucia: 'lc',
  saintvincentandgrenadines: 'vc',
  vincentandgrenadines: 'vc',
  saintvincent: 'vc',
  trinidadtobago: 'tt',
  antiguabarbuda: 'ag',
  turksandcaicos: 'tc',
  saotomeandprincipe: 'st',
  saotomeprincipe: 'st',
  timorleste: 'tl',
  easttimor: 'tl',
  vatican: 'va',
  bahamas: 'bs',
  gambia: 'gm',
  congo: 'cg',
  drcongo: 'cd',
  kyrgyzstan: 'kg',
  kirghizia: 'kg',
  brunei: 'bn',
  bolivia: 'bo',
  venezuela: 've',
  tanzania: 'tz',
  micronesia: 'fm',
  caymans: 'ky',
  cayman: 'ky',
  reunion: 're',
  curacao: 'cw',
  frenchguiana: 'gf',
  guineabissau: 'gw',
  equatorialguinea: 'gq',
  papuanewguinea: 'pg',
  newcaledonia: 'nc',
  frenchpolynesia: 'pf',
  virginbritish: 'vg',
  britishvirgin: 'vg',
  uae: 'ae',
  emirates: 'ae',
  unitedarabemirates: 'ae',
  salvador: 'sv',
  elsalvador: 'sv',
  dominicana: 'do',
  dominican: 'do',
  kosovo: 'xk',
  // ISO renamed it Türkiye; resellers still say Turkey.
  turkey: 'tr',
  // Spellings seen verbatim on hero-sms / smsbower.
  russian: 'ru', // "Russian Federation" once "federation" is stripped
  laopeoples: 'la',
  cotedivoireivorycoast: 'ci',
  argentinas: 'ar',
  papua: 'pg',
  papuanewgvineya: 'pg',
  bosnia: 'ba',
  bruneidarussalam: 'bn',
  syrianarab: 'sy',
  // Only the parenthetical tells the two Congos apart — matched before it's stripped.
  congodem: 'cd',
};

let index: Map<string, string> | null = null;

function buildIndex(): Map<string, string> {
  const m = new Map<string, string>();
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        continue;
      }
      // Unknown codes echo back unchanged — skip those.
      if (!name || name === code) continue;
      const key = norm(name);
      if (!key) continue;
      // Retired codes (BU Burma, DD East Germany, YD, RH, NH…) share names with
      // current ones — let a code libphonenumber still knows win the slot.
      const prev = m.get(key);
      if (!prev || (!isSupportedCountry(prev.toUpperCase()) && isSupportedCountry(code))) {
        m.set(key, code.toLowerCase());
      }
    }
  }
  for (const [k, v] of Object.entries(ALIASES)) m.set(k, v);
  return m;
}

/** Dial code (no "+") for an ISO-2, or undefined if unknown. */
export function dialCodeFor(iso2: string | undefined): string | undefined {
  if (!iso2) return undefined;
  const up = iso2.toUpperCase();
  return isSupportedCountry(up) ? getCountryCallingCode(up) : undefined;
}

/** Resolve an English country name to `{ iso2, dialCode }`; `{}` when unknown. */
export function lookupCountry(name: string): { iso2?: string; dialCode?: string } {
  index ??= buildIndex();
  const iso2 = index.get(norm(name, true)) ?? index.get(norm(name));
  return iso2 ? { iso2, dialCode: dialCodeFor(iso2) } : {};
}
