import type { ForgotPasswordBody, LoginBody, RegisterBody, ResetPasswordBody, VerifyEmailBody } from '@smsgecko/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { toPublicUser } from '../models/User.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../lib/authCookies.js';
import { unauthorized } from '../lib/errors.js';
import {
  authenticate,
  issueEmailVerification,
  issuePasswordReset,
  issueSession,
  registerUser,
  resetPassword as resetPasswordToken,
  revokeRefresh,
  rotateRefresh,
  verifyEmail as verifyEmailToken,
} from '../services/auth.service.js';

function sessionMeta(req: { headers: Record<string, unknown>; ip?: string }) {
  return {
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    ip: req.ip ?? null,
  };
}

export const register = asyncHandler(async (req, res) => {
  const user = await registerUser(req.body as RegisterBody);
  const { accessToken, refreshToken } = await issueSession(user, sessionMeta(req));
  setAuthCookies(res, accessToken, refreshToken);
  res.status(201).json({ user: toPublicUser(user) });
});


export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body as LoginBody;
  const user = await authenticate(identifier, password);
  const { accessToken, refreshToken } = await issueSession(user, sessionMeta(req));
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: toPublicUser(user) });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body as VerifyEmailBody;
  const user = await verifyEmailToken(token);
  res.json({ user: toPublicUser(user) });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const user = req.authUser!;
  if (!user.isVerified) await issueEmailVerification(user);
  res.json({ ok: true as const });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body as ForgotPasswordBody;
  await issuePasswordReset(email);
  res.json({ ok: true as const });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body as ResetPasswordBody;
  const user = await resetPasswordToken(token, password);
  // Reset implies "get me back in" — sign them in on the spot instead of
  // making them retype the password they just set on the login page.
  const { accessToken, refreshToken } = await issueSession(user, sessionMeta(req));
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: toPublicUser(user) });
});

export const refresh = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!raw) throw unauthorized('No active session');
  const { accessToken, refreshToken, user } = await rotateRefresh(raw, sessionMeta(req));
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: toPublicUser(user) });
});

export const logout = asyncHandler(async (req, res) => {
  await revokeRefresh(req.cookies?.[REFRESH_COOKIE] as string | undefined);
  clearAuthCookies(res);
  res.json({ ok: true as const });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: toPublicUser(req.authUser!) });
});
