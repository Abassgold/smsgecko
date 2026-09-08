import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/*
 * Next.js 16 renamed Middleware -> Proxy (same mechanism). This is the app's
 * single route guard, and it is DEFAULT-DENY: `config.matcher` runs it on every
 * route except /api and static assets, and anything not listed as public below
 * is redirected to /login without a session. New routes are protected
 * automatically — you opt routes OUT here, never IN.
 *
 * Session presence is all this checks. Email-verification and admin-role gating
 * live in the (dashboard)/(admin) layouts and are enforced by the API.
 */

// Exact public paths — no session required.
const PUBLIC_EXACT = new Set([
  '/', // marketing home
  '/contact',
  '/docs',
  '/faq',
  '/platforms',
  '/pricing',
  '/login',
  '/register',
  '/verify-email',
]);

const PUBLIC_PREFIXES = ['/docs/', '/verify-email/'];

const AUTH_ONLY = new Set(['/login', '/register']);

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

/** Only allow same-origin, non-protocol-relative redirect targets. */
function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession =
    request.cookies.has('smsg_access') || request.cookies.has('smsg_refresh');

  if (!hasSession && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_ONLY.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get('next')) ?? '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
