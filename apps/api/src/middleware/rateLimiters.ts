import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Tighter throttle for credential endpoints (register / login / verify-email /
 * refresh). Effectively disabled under test so the suite can hammer them.
 */
export const tightAuthLimiter: RequestHandler =
  env.NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
