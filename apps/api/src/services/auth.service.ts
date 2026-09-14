import type { RegisterBody } from '@smsgecko/shared';
import { AFFILIATE_TERMS_VERSION } from '@smsgecko/shared';
import { User, type UserDoc } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { EmailToken } from '../models/EmailToken.js';
import {
  friendlyCode,
  hashPassword,
  randomToken,
  randomUUID,
  sha256,
  verifyPassword,
} from '../lib/crypto.js';
import {
  decodeExpiry,
  signAccessToken,
  signRefreshToken,
  signTwoFactorPendingToken,
  verifyRefreshToken,
  verifyTwoFactorPendingToken,
} from '../lib/tokens.js';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors.js';
import { getSettings } from '../lib/settings.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/email.js';
import { decryptJson, encryptJson } from '../lib/secretbox.js';
import { generateTotpSecret, totpUri, verifyTotp } from '../lib/totp.js';

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
}

async function uniqueAffiliateCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = friendlyCode(12);
    if (!(await User.exists({ affiliateCode: code }))) return code;
  }
  return friendlyCode(16);
}

async function uniqueUsername(seed: string): Promise<string> {
  const cleanedBase = seed
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 15) || 'user';
  // Leave room for a numeric suffix so collision fallbacks stay within 15 chars.
  const suffixBase = cleanedBase.slice(0, 11);
  let candidate = cleanedBase;
  for (let i = 0; i < 20; i++) {
    if (!(await User.exists({ username: candidate }))) return candidate;
    candidate = `${suffixBase}${Math.floor(Math.random() * 9000) + 1000}`;
  }
  return `${suffixBase}${randomToken(4)}`;
}

export async function registerUser(body: RegisterBody): Promise<UserDoc> {
  const email = body.email.toLowerCase().trim();
  if (!(await getSettings()).signupsEnabled) {
    throw forbidden('New sign-ups are currently disabled');
  }
  if (await User.exists({ email })) {
    throw conflict('An account with that email already exists');
  }

  let referredBy: UserDoc | null = null;
  if (body.referralCode) {
    referredBy = await User.findOne({ affiliateCode: body.referralCode.toUpperCase() });
    if (!referredBy) throw badRequest('Unknown referral code');
  }

  const username = body.username
    ? await ensureUsernameAvailable(body.username)
    : await uniqueUsername(email.split('@')[0] ?? 'user');

  const user = await User.create({
    email,
    username,
    passwordHash: await hashPassword(body.password),
    affiliateCode: await uniqueAffiliateCode(),
    affiliateTermsVersion: null,
    referredBy: referredBy?._id ?? null,
  });

  await issueEmailVerification(user);

  return user;
}

/**
 * Mint a fresh verification token for `user`, invalidate any older ones, and
 * email the link. Failures to send are logged but never block the caller —
 * the user can always hit "resend".
 */
export async function issueEmailVerification(user: UserDoc): Promise<void> {
  const rawToken = randomToken(32);
  await EmailToken.deleteMany({ userId: user._id, purpose: 'verify_email', consumedAt: null });
  await EmailToken.create({
    userId: user._id,
    purpose: 'verify_email',
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000),
  });

  const link = `${env.APP_URL.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
  try {
    await sendVerificationEmail(user.email, link);
  } catch (err) {
    logger.error({ err, userId: user.id }, 'failed to send verification email');
  }
}

/** Consume a verification token and flip the user's `isVerified` flag. */
export async function verifyEmail(rawToken: string): Promise<UserDoc> {
  const record = await EmailToken.findOne({
    tokenHash: sha256(rawToken),
    purpose: 'verify_email',
  });
  if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
    throw badRequest('This verification link is invalid or has expired');
  }

  const user = await User.findById(record.userId);
  if (!user) throw badRequest('This verification link is invalid or has expired');

  record.consumedAt = new Date();
  await record.save();

  if (!user.isVerified) {
    user.isVerified = true;
    await user.save();
  }
  return user;
}

/**
 * Mint a password-reset token and email it, if `email` belongs to an account.
 * Always resolves the same way either way — the caller can't tell from this
 * whether the address is registered, so it can't be used to enumerate users.
 */
export async function issuePasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return;

  const rawToken = randomToken(32);
  await EmailToken.deleteMany({ userId: user._id, purpose: 'reset_password', consumedAt: null });
  await EmailToken.create({
    userId: user._id,
    purpose: 'reset_password',
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
  });

  const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
  try {
    await sendPasswordResetEmail(user.email, link);
  } catch (err) {
    logger.error({ err, userId: user.id }, 'failed to send password reset email');
  }
}

/**
 * Consume a reset token, set the new password, and revoke every existing
 * session — a stolen session cookie shouldn't survive its owner resetting
 * their password.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<UserDoc> {
  const record = await EmailToken.findOne({
    tokenHash: sha256(rawToken),
    purpose: 'reset_password',
  });
  if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
    throw badRequest('This reset link is invalid or has expired');
  }

  const user = await User.findById(record.userId);
  if (!user) throw badRequest('This reset link is invalid or has expired');

  record.consumedAt = new Date();
  await record.save();

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return user;
}

async function ensureUsernameAvailable(username: string): Promise<string> {
  if (await User.exists({ username })) throw conflict('That username is taken');
  return username;
}

/** `identifier` may be an email address or a username (both stored lowercased). */
export async function authenticate(identifier: string, password: string): Promise<UserDoc> {
  const id = identifier.toLowerCase().trim();
  const user = await User.findOne({ $or: [{ email: id }, { username: id }] });
  if (!user) {
    // Constant-ish time: still run a hash comparison against a dummy.
    await verifyPassword('$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', password);
    throw unauthorized('Invalid email or password');
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw unauthorized('Invalid email or password');
  if (user.status === 'suspended') throw forbidden('This account has been suspended');
  return user;
}

interface TotpSecretBlob {
  secret?: string;
}

/** Start 2FA setup: a fresh secret, held as "pending" until confirmed with a
 *  real code (so a scan gone wrong can't lock the account into a bad state). */
export async function setupTwoFactor(user: UserDoc): Promise<{ secret: string; otpauthUrl: string }> {
  const secret = generateTotpSecret();
  user.twoFactorPendingSecretEnc = encryptJson({ secret } satisfies TotpSecretBlob);
  await user.save();
  return { secret, otpauthUrl: totpUri(secret, user.email) };
}

/** Confirm setup with a live code, turn 2FA on, and hand back one-time
 *  recovery codes (shown once — only their hashes are kept). */
export async function enableTwoFactor(user: UserDoc, code: string): Promise<string[]> {
  const pending = decryptJson<TotpSecretBlob>(user.twoFactorPendingSecretEnc);
  if (!pending.secret) throw badRequest('Start two-factor setup first');
  if (!verifyTotp(pending.secret, code)) throw badRequest('Incorrect code');

  const recoveryCodes = Array.from({ length: 10 }, () => friendlyCode(10));
  user.twoFactorEnabled = true;
  user.twoFactorSecretEnc = encryptJson({ secret: pending.secret } satisfies TotpSecretBlob);
  user.twoFactorPendingSecretEnc = null;
  user.twoFactorRecoveryHashes = recoveryCodes.map((c) => sha256(c));
  await user.save();
  return recoveryCodes;
}

/** A code is valid if it matches the live TOTP secret, or an unused recovery
 *  code — the latter is burned (removed) the moment it's spent either way. */
async function checkTwoFactorCode(user: UserDoc, code: string): Promise<boolean> {
  const { secret } = decryptJson<TotpSecretBlob>(user.twoFactorSecretEnc);
  if (secret && verifyTotp(secret, code)) return true;

  const idx = user.twoFactorRecoveryHashes.indexOf(sha256(code));
  if (idx === -1) return false;
  user.twoFactorRecoveryHashes.splice(idx, 1);
  await user.save();
  return true;
}

export async function disableTwoFactor(user: UserDoc, password: string, code: string): Promise<void> {
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw unauthorized('Incorrect password');
  }
  if (!(await checkTwoFactorCode(user, code))) throw badRequest('Incorrect code');
  user.twoFactorEnabled = false;
  user.twoFactorSecretEnc = null;
  user.twoFactorRecoveryHashes = [];
  await user.save();
}

/** The second step of login for a 2FA-enabled account: exchange the
 *  pending-login token + a code for the actual user (caller issues the session). */
export async function verifyTwoFactorLogin(pendingToken: string, code: string): Promise<UserDoc> {
  const claims = verifyTwoFactorPendingToken(pendingToken);
  if (!claims) throw unauthorized('This login attempt has expired — sign in again');
  const user = await User.findById(claims.sub);
  if (!user || !user.twoFactorEnabled) throw unauthorized('Invalid session');
  if (user.status === 'suspended') throw forbidden('This account has been suspended');
  if (!(await checkTwoFactorCode(user, code))) throw unauthorized('Incorrect code');
  return user;
}

export { signTwoFactorPendingToken };

export async function issueSession(user: UserDoc, meta: SessionMeta = {}): Promise<IssuedSession> {
  const family = randomUUID();
  return mintTokens(user.id as string, family, meta);
}

async function mintTokens(
  userId: string,
  family: string,
  meta: SessionMeta,
  replaces?: { jti: string },
): Promise<IssuedSession> {
  const jti = randomUUID();
  const refreshToken = signRefreshToken(userId, jti, family);
  const accessToken = signAccessToken(userId);

  await RefreshToken.create({
    userId,
    jti,
    tokenHash: sha256(refreshToken),
    family,
    expiresAt: decodeExpiry(refreshToken) ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });

  if (replaces) {
    await RefreshToken.updateOne(
      { jti: replaces.jti },
      { $set: { revokedAt: new Date(), replacedByJti: jti } },
    );
  }

  return { accessToken, refreshToken };
}

export interface RotationResult extends IssuedSession {
  user: UserDoc;
}

export async function rotateRefresh(rawToken: string, meta: SessionMeta = {}): Promise<RotationResult> {
  const claims = verifyRefreshToken(rawToken);
  if (!claims) throw unauthorized('Invalid session');

  const stored = await RefreshToken.findOne({ jti: claims.jti });
  if (!stored || stored.tokenHash !== sha256(rawToken)) {
    throw unauthorized('Invalid session');
  }

  if (stored.revokedAt) {
    // Reuse of an already-rotated token => likely theft. Nuke the family.
    await RefreshToken.updateMany(
      { family: stored.family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw unauthorized('Session expired, please sign in again');
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Session expired, please sign in again');
  }

  const user = await User.findById(claims.sub);
  if (!user) throw unauthorized('Invalid session');

  const tokens = await mintTokens(user.id as string, stored.family, meta, { jti: stored.jti });
  return { ...tokens, user };
}

export async function revokeRefresh(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const claims = verifyRefreshToken(rawToken);
  if (!claims) return;
  await RefreshToken.updateOne(
    { jti: claims.jti, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
