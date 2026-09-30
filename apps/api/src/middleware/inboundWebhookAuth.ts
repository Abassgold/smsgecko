import type { RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { logger } from '../lib/logger.js';
import { unauthorized } from '../lib/errors.js';

const INBOUND_SECRET_HEADER = 'x-webhook-secret';
let warnedUnset = false;

/** Constant-time compare that never leaks length (both sides hashed to 32B first). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Guards the inbound SMS webhook (POST /api/v1/webhooks/sms), which otherwise
 * lets anyone force-complete an order with a forged OTP.
 *
 * Read from `process.env` at call time (not the parsed `env` singleton) so the
 * secret can be rotated without a restart and tests can set it per case.
 *
 * When SMS_INBOUND_SECRET is configured, the caller must send it in the
 * `X-Webhook-Secret` header. When it is NOT configured, the endpoint stays open
 * but logs one loud warning — so deploying this change never breaks live code
 * delivery before the env var is rolled out to the forwarders. Set it in prod
 * (here AND on every forwarder) to close the hole.
 */
export const requireInboundSecret: RequestHandler = (req, _res, next) => {
  const configured = (process.env.SMS_INBOUND_SECRET ?? '').trim();
  if (!configured) {
    if (!warnedUnset) {
      warnedUnset = true;
      logger.warn(
        '[webhooks] SMS_INBOUND_SECRET is not set — POST /api/v1/webhooks/sms is UNAUTHENTICATED. ' +
          'Set it here and on every forwarder (FloZap, NexuzMarket) to lock it down.',
      );
    }
    return next();
  }
  const provided = req.get(INBOUND_SECRET_HEADER)?.trim() ?? '';
  if (!provided || !safeEqual(provided, configured)) {
    return next(unauthorized('Invalid or missing webhook secret'));
  }
  next();
};
