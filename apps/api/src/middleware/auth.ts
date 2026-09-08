import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';
import { ACCESS_COOKIE } from '../lib/authCookies.js';
import { User } from '../models/User.js';
import { emailNotVerified, forbidden, unauthorized } from '../lib/errors.js';

/**
 * Global middleware: resolve `req.authUser` from the access-token cookie when
 * one is present. Never blocks — anonymous requests just get `authUser = null`.
 */
export const attachUser: RequestHandler = (req, _res, next) => {
  req.authUser = null;
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) return next();
  const claims = verifyAccessToken(token);
  if (!claims) return next();
  User.findById(claims.sub)
    .then((user) => {
      req.authUser = user ?? null;
      next();
    })
    .catch(() => next());
};

/** 401 unless a valid access-token cookie resolved to an active user. */
export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.authUser) return next(unauthorized());
  if (req.authUser.status === 'suspended') {
    return next(forbidden('This account has been suspended'));
  }
  next();
};

/** requireUser + a verified email address (403 `email_not_verified` otherwise). */
export const requireVerified: RequestHandler = (req, _res, next) => {
  if (!req.authUser) return next(unauthorized());
  if (req.authUser.status === 'suspended') {
    return next(forbidden('This account has been suspended'));
  }
  if (!req.authUser.isVerified) return next(emailNotVerified());
  next();
};

/** requireUser + role === 'admin'. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.authUser) return next(unauthorized());
  if (req.authUser.role !== 'admin') return next(forbidden('Admin only'));
  next();
};
