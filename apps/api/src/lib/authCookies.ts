import type { Response } from 'express';
import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'smsg_access';
export const REFRESH_COOKIE = 'smsg_refresh';

/** Refresh cookie is scoped to the auth routes only. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const base = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.COOKIE_SECURE,
};

// Express `res.cookie` takes maxAge in milliseconds.
const ACCESS_MAX_AGE_MS = 60 * 60 * 1000; // 1h ceiling; JWT exp is the real limit
const REFRESH_MAX_AGE_MS = 60 * 60 * 24 * 30 * 1000; // 30d

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: ACCESS_MAX_AGE_MS });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
}
