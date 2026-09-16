import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';
import { ACCESS_COOKIE } from '../lib/authCookies.js';
import { User } from '../models/User.js';
import { emailNotVerified, forbidden, unauthorized } from '../lib/errors.js';

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

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.authUser) return next(unauthorized());
  if (req.authUser.status === 'suspended') {
    return next(forbidden('This account has been suspended'));
  }
  next();
};

export const requireVerified: RequestHandler = (req, _res, next) => {
  if (!req.authUser) return next(unauthorized());
  if (req.authUser.status === 'suspended') {
    return next(forbidden('This account has been suspended'));
  }
  if (!req.authUser.isVerified) return next(emailNotVerified());
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.authUser) return next(unauthorized());
  if (req.authUser.role !== 'admin') return next(forbidden('Admin only'));
  next();
};
