'use client';

import { useEffect } from 'react';

const COOKIE = 'gecko_src';
const MAX_AGE = 90 * 24 * 3600;

/**
 * Remembers how a visitor first reached the site (utm tags, ad click id, referring site, landing page) in a
 * first-party cookie for 90 days. The API reads it once, at signup, to label where the account came from (admin →
 * Audience). First touch wins: later visits never overwrite it.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE}=`))) return;
      const p = new URLSearchParams(window.location.search);
      const take = (k: string, max = 80) => p.get(k)?.trim().slice(0, max) || undefined;
      let r: string | undefined;
      if (document.referrer) {
        const host = new URL(document.referrer).hostname;
        if (host && host !== window.location.hostname) r = host;
      }
      const k = ['gclid', 'fbclid', 'ttclid'].find((id) => p.has(id));
      const data = { s: take('utm_source'), m: take('utm_medium'), c: take('utm_campaign', 120), r, l: window.location.pathname.slice(0, 200), k };
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(data))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    } catch {
      // Attribution is best effort; never break the page over it.
    }
  }, []);
  return null;
}
