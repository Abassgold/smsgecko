import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessClaims {
  sub: string;
  type: 'access';
}

export interface RefreshClaims {
  sub: string;
  type: 'refresh';
  jti: string;
  family: string;
}

export function signAccessToken(userId: string): string {
  const opts: SignOptions = { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId, type: 'access' } satisfies AccessClaims, env.JWT_ACCESS_SECRET, opts);
}

export function signRefreshToken(userId: string, jti: string, family: string): string {
  const opts: SignOptions = { expiresIn: env.REFRESH_TOKEN_TTL as SignOptions['expiresIn'] };
  return jwt.sign(
    { sub: userId, type: 'refresh', jti, family } satisfies RefreshClaims,
    env.JWT_REFRESH_SECRET,
    opts,
  );
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
    return decoded.type === 'access' ? decoded : null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshClaims;
    return decoded.type === 'refresh' ? decoded : null;
  } catch {
    return null;
  }
}

/** Decode without verifying — used to read exp for the cookie maxAge. */
export function decodeExpiry(token: string): Date | null {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ? new Date(decoded.exp * 1000) : null;
}
