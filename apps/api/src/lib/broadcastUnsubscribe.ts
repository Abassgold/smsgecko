import { hmacSha256Hex } from './crypto.js';
import { env } from '../config/env.js';

/**
 * One-click unsubscribe token: `<userId>.<hmac>`, verifiable without a DB
 * lookup or a login (the whole point — it has to work from a mail client
 * that isn't signed in). Reuses JWT_ACCESS_SECRET rather than adding a
 * dedicated env var for one small feature — it's already a required
 * server-only secret, and this is the same "sign something with a server
 * secret" job JWTs already do.
 */
export function signUnsubscribeToken(userId: string): string {
  return `${userId}.${hmacSha256Hex(env.JWT_ACCESS_SECRET, userId)}`;
}

/** Returns the userId if the token is well-formed and its signature checks
 * out; null otherwise. */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!userId || sig !== hmacSha256Hex(env.JWT_ACCESS_SECRET, userId)) return null;
  return userId;
}
