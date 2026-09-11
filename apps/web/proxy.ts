import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/*
 * Next.js 16 renamed Middleware -> Proxy (same mechanism). This is the app's
 * single route guard, and it is DEFAULT-DENY: `config.matcher` runs it on every
 * route except /api and static assets, and anything not listed as public below
 * is redirected to /login without a session. New routes are protected
 * automatically — you opt routes OUT here, never IN.
 *
 * Session presence gates everything; on top of that, /admin also requires the
 * session to resolve to an admin user (checked against the API). Email
 * verification is still enforced in the (dashboard) layout and by the API.
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

const API_ORIGIN = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** Only allow same-origin, non-protocol-relative redirect targets. */
function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

/**
 * Resolve the caller's role from the API using their forwarded cookies.
 * Returns `null` when the API says the session is invalid, `'unknown'` when the
 * API can't be reached (fail open — the layout still gates).
 */
async function fetchRole(cookie: string): Promise<'user' | 'admin' | null | 'unknown'> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (res.status === 401) return null;
    if (!res.ok) return 'unknown';
    const body = (await res.json()) as { user?: { role?: 'user' | 'admin' } };
    return body.user?.role ?? 'user';
  } catch {
    return 'unknown';
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAccess = request.cookies.has('smsg_access');
  const hasRefresh = request.cookies.has('smsg_refresh');
  const hasSession = hasAccess || hasRefresh;

  const toLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  };

  if (!hasSession && !isPublic(pathname)) return toLogin();

  if (hasSession && AUTH_ONLY.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get('next')) ?? '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (hasSession && isAdminPath(pathname)) {
    // Only spend a round-trip when we have an access token to check. A
    // refresh-only session falls through to the (admin) layout, which
    // refreshes and then enforces the role itself.
    if (hasAccess) {
      const role = await fetchRole(request.headers.get('cookie') ?? '');
      if (role === null) return hasRefresh ? NextResponse.next() : toLogin();
      if (role === 'user') {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        url.search = '';
        return NextResponse.redirect(url);
      }
      // 'admin' or 'unknown' (API unreachable) -> let the layout handle it.
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|icon|apple-icon|opengraph-image).*)',
  ],
};
