import type { RequestHandler } from 'express';
import { tooManyRequests } from '../lib/errors.js';

/**
 * Per-user minimum-gap-between-calls throttle — not the same thing as the
 * request-count-based rate limiters elsewhere in this app (those cap "N
 * requests per window"; this caps "how soon can you call this again").
 *
 * Use it specifically on actions where a rapid double-click or a naive
 * client-side retry could trigger a real duplicate side effect — a second
 * charge, a second purchase from an upstream provider — not as a
 * general-purpose limiter. Ported from a proven pattern already in
 * production in the FloZap codebase this project is partly built from.
 *
 * Must run after whatever middleware populates `req.authUser` /
 * `req.apiUser` (`requireVerified` / `requireApiKey`), so it can key by
 * user rather than falling back to IP.
 */
export function throttle(ms: number): RequestHandler {
  const lastCall = new Map<string, number>();

  return (req, _res, next) => {
    const userId = req.authUser?.id ?? req.apiUser?.id;
    const key = userId ? String(userId) : (req.ip ?? 'unknown');
    const now = Date.now();
    const prev = lastCall.get(key) ?? 0;

    if (now - prev < ms) {
      const retryAfterSeconds = Math.max(1, Math.ceil((ms - (now - prev)) / 1000));
      next(tooManyRequests(`Please wait ${retryAfterSeconds}s before trying again.`));
      return;
    }

    lastCall.set(key, now);
    // Same manual-cleanup approach as the FloZap original — this Map lives
    // for the process's lifetime, so it needs to not grow forever.
    if (lastCall.size > 500) {
      for (const [k, t] of lastCall) {
        if (now - t > ms) lastCall.delete(k);
      }
    }

    next();
  };
}
