import type {
  DisableTwoFactorBody,
  EnableTwoFactorBody,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
  VerifyTwoFactorBody,
} from '@smsgecko/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { toPublicUser } from '../models/User.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../lib/authCookies.js';
import { unauthorized } from '../lib/errors.js';
import {
  authenticate,
  disableTwoFactor,
  enableTwoFactor,
  issueEmailVerification,
  issuePasswordReset,
  issueSession,
  registerUser,
  resetPassword as resetPasswordToken,
  revokeRefresh,
  rotateRefresh,
  setupTwoFactor,
  signTwoFactorPendingToken,
  verifyEmail as verifyEmailToken,
  verifyTwoFactorLogin,
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
  if (user.twoFactorEnabled) {
    // Password checked out, but the session waits on a code — no cookies yet.
    res.json({ twoFactorRequired: true as const, pendingToken: signTwoFactorPendingToken(user.id as string) });
    return;
  }
  const { accessToken, refreshToken } = await issueSession(user, sessionMeta(req));
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: toPublicUser(user) });
});

export const verifyTwoFactor = asyncHandler(async (req, res) => {
  const { pendingToken, code } = req.body as VerifyTwoFactorBody;
  const user = await verifyTwoFactorLogin(pendingToken, code);
  const { accessToken, refreshToken } = await issueSession(user, sessionMeta(req));
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: toPublicUser(user) });
});

export const setupTwoFactorHandler = asyncHandler(async (req, res) => {
  res.json(await setupTwoFactor(req.authUser!));
});

export const enableTwoFactorHandler = asyncHandler(async (req, res) => {
  const { code } = req.body as EnableTwoFactorBody;
  const recoveryCodes = await enableTwoFactor(req.authUser!, code);
  res.json({ recoveryCodes });
});

export const disableTwoFactorHandler = asyncHandler(async (req, res) => {
  const { password, code } = req.body as DisableTwoFactorBody;
  await disableTwoFactor(req.authUser!, password, code);
  res.json({ ok: true as const });
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
