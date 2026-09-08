import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16 renamed Middleware -> Proxy. Same mechanism.

const PROTECTED = [
  '/dashboard',
  '/orders',
  '/deposit',
  '/transactions',
  '/affiliate',
  '/settings',
  '/tickets',
  '/admin',
];
const AUTH_PAGES = ['/login', '/register'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession =
    request.cookies.has('smsg_access') || request.cookies.has('smsg_refresh');

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (AUTH_PAGES.includes(pathname) && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/orders/:path*',
    '/deposit/:path*',
    '/transactions/:path*',
    '/affiliate/:path*',
    '/settings/:path*',
    '/tickets/:path*',
    '/admin',
    '/admin/:path*',
    '/login',
    '/register',
  ],
};
