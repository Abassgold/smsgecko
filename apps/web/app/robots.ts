import type { MetadataRoute } from 'next';

const SITE_URL = 'https://smsgecko.com';

// Mirrors proxy.ts's PUBLIC_EXACT/PUBLIC_PREFIXES: everything gated behind a
// session there is disallowed here too, so crawlers don't spend budget on
// pages that just redirect to /login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard',
        '/orders',
        '/deposit',
        '/settings',
        '/transactions',
        '/affiliate',
        '/admin',
        '/verify-email',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
