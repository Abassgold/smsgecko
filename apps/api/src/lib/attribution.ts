import { createRequire } from 'node:module';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { logger } from './logger.js';

/**
 * Where a new account came from, for ad planning: the visitor's country (looked up offline from the IP, which is then
 * discarded) and the first-touch traffic source the web app saved in the `gecko_src` cookie.
 */

export const SOURCE_COOKIE = 'gecko_src';

export interface SignupSource {
  /** Grouping shown in admin: an utm_source, "google ads", "facebook ads", a referring site's host, "referral" or "direct". */
  channel: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /** Host of the external page that sent the visitor, if any. */
  referrer: string | null;
  /** First page they landed on (path only). */
  landing: string | null;
}

export interface SignupContext {
  country: string | null;
  source: SignupSource;
}

type Lookup = (ip: string) => { country?: string } | null;
let lookup: Lookup | null | undefined;

/** The GeoIP table is ~8 MB in memory; load it on the first signup, not at startup. */
function geo(): Lookup | null {
  if (lookup !== undefined) return lookup;
  try {
    const mod = createRequire(import.meta.url)('geoip-country') as { lookup: Lookup };
    lookup = (ip) => mod.lookup(ip);
  } catch (err) {
    logger.error({ err }, '[attribution] could not load the GeoIP table; signup countries are off');
    lookup = null;
  }
  return lookup;
}

const PRIVATE_V4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/;
const isPublic = (ip: string) => {
  const v = isIP(ip);
  if (v === 4) return !PRIVATE_V4.test(ip);
  if (v === 6) return !/^(::1?$|f[cd]|fe[89ab])/i.test(ip);
  return false;
};

/**
 * The visitor's own address. Requests reach us through Render's edge and the web app's rewrite, each adding to
 * X-Forwarded-For, so the original client is the left-most public entry. A visitor could fake this header, but that
 * only mislabels their own country in a statistic, so it is good enough here (never use this for security).
 */
export function clientIp(req: Pick<Request, 'headers' | 'ip'>): string | null {
  const candidates: string[] = [];
  for (const h of ['cf-connecting-ip', 'true-client-ip']) {
    const v = req.headers[h];
    if (typeof v === 'string') candidates.push(v.trim());
  }
  const fwd = req.headers['x-forwarded-for'];
  const list = Array.isArray(fwd) ? fwd.join(',') : (fwd ?? '');
  candidates.push(...list.split(',').map((s) => s.trim()));
  if (req.ip) candidates.push(req.ip);
  for (const c of candidates) {
    const ip = c.replace(/^::ffff:/i, '');
    if (isPublic(ip)) return ip;
  }
  return null;
}

/** ISO 3166-1 alpha-2 country of the request, or null when unknown (private IP, no match). */
export function countryOf(req: Pick<Request, 'headers' | 'ip'>): string | null {
  // An edge that already resolved the country (Cloudflare) is trusted first.
  const edge = req.headers['cf-ipcountry'];
  if (typeof edge === 'string' && /^[A-Z]{2}$/.test(edge) && edge !== 'XX' && edge !== 'T1') return edge;
  const ip = clientIp(req);
  if (!ip) return null;
  const hit = geo()?.(ip);
  return hit?.country && /^[A-Z]{2}$/.test(hit.country) ? hit.country : null;
}

const clean = (v: unknown, max = 80): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return s || null;
};

/** Reads the web app's first-touch cookie. Anything malformed becomes "direct"; nothing in it is trusted beyond display. */
export function sourceOf(req: Pick<Request, 'cookies'>): SignupSource {
  let raw: Record<string, unknown> = {};
  try {
    const v = req.cookies?.[SOURCE_COOKIE];
    if (typeof v === 'string' && v.length <= 2000) {
      const parsed: unknown = JSON.parse(v);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
    }
  } catch {
    raw = {};
  }
  const utmSource = clean(raw.s)?.toLowerCase() ?? null;
  const utmMedium = clean(raw.m)?.toLowerCase() ?? null;
  const utmCampaign = clean(raw.c, 120);
  let referrer = clean(raw.r, 200);
  if (referrer) {
    try {
      referrer = new URL(referrer.includes('://') ? referrer : `https://${referrer}`).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      referrer = null;
    }
  }
  const landingRaw = clean(raw.l, 200);
  const landing = landingRaw?.startsWith('/') ? landingRaw.split(/[?#]/)[0]! : null;
  const click = clean(raw.k, 10);

  const channel =
    utmSource ??
    (click === 'gclid' ? 'google ads' : click === 'fbclid' ? 'facebook ads' : click === 'ttclid' ? 'tiktok ads' : null) ??
    referrer ??
    (landing?.startsWith('/r/') ? 'referral' : 'direct');
  return { channel, utmSource, utmMedium, utmCampaign, referrer, landing };
}

export function signupContext(req: Pick<Request, 'headers' | 'ip' | 'cookies'>): SignupContext {
  return { country: countryOf(req), source: sourceOf(req) };
}
