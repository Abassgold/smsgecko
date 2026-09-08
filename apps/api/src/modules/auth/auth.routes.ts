import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { loginBody, registerBody, verifyEmailBody } from '@smsgecko/shared';
import { toPublicUser } from '../../models/User.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../../lib/authCookies.js';
import { unauthorized } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { parse } from '../../lib/validate.js';
import { requireUser } from '../../middleware/auth.js';
import {
  authenticate,
  issueEmailVerification,
  issueSession,
  registerUser,
  revokeRefresh,
  rotateRefresh,
  verifyEmail,
} from './auth.service.js';

// Tighter throttle on credential endpoints; effectively off under test.
const tight: RequestHandler =
  env.NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

export const authRouter = Router();

authRouter.post('/register', tight, async (req, res) => {
  const user = await registerUser(parse(registerBody, req.body));
  const { accessToken, refreshToken } = await issueSession(user, {
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
  });
  setAuthCookies(res, accessToken, refreshToken);
  res.status(201).json({ user: toPublicUser(user) });
});

authRouter.post('/login', tight, async (req, res) => {
  const { identifier, password } = parse(loginBody, req.body);
  const user = await authenticate(identifier, password);
  const { accessToken, refreshToken } = await issueSession(user, {
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
  });
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/verify-email', tight, async (req, res) => {
  const { token } = parse(verifyEmailBody, req.body);
  const user = await verifyEmail(token);
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/resend-verification', tight, requireUser, async (req, res) => {
  const user = req.authUser!;
  if (!user.isVerified) await issueEmailVerification(user);
  res.json({ ok: true as const });
});

authRouter.post('/refresh', tight, async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!raw) throw unauthorized('No active session');
  const { accessToken, refreshToken, user } = await rotateRefresh(raw, {
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
  });
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/logout', async (req, res) => {
  await revokeRefresh(req.cookies?.[REFRESH_COOKIE] as string | undefined);
  clearAuthCookies(res);
  res.json({ ok: true as const });
});

authRouter.get('/me', requireUser, async (req, res) => {
  // requireUser guarantees authUser is set.
  res.json({ user: toPublicUser(req.authUser!) });
});
