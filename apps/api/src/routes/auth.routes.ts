import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { tightAuthLimiter } from '../middleware/rateLimiters.js';
import {
  changePasswordBody,
  disableTwoFactorBody,
  enableTwoFactorBody,
  forgotPasswordBody,
  loginBody,
  registerBody,
  resetPasswordBody,
  verifyEmailBody,
  verifyTwoFactorBody,
} from '../lib/validation/auth.schema.js';
import {
  changePassword,
  disableTwoFactorHandler,
  enableTwoFactorHandler,
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resendVerification,
  resetPassword,
  setupTwoFactorHandler,
  verifyEmail,
  verifyTwoFactor,
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', tightAuthLimiter, validate(registerBody), register);
router.post('/login', tightAuthLimiter, validate(loginBody), login);
router.post('/verify-email', tightAuthLimiter, validate(verifyEmailBody), verifyEmail);
router.post('/resend-verification', tightAuthLimiter, requireUser, resendVerification);
router.post('/forgot-password', tightAuthLimiter, validate(forgotPasswordBody), forgotPassword);
router.post('/reset-password', tightAuthLimiter, validate(resetPasswordBody), resetPassword);
router.post(
  '/change-password',
  tightAuthLimiter,
  requireUser,
  validate(changePasswordBody),
  changePassword,
);
router.post('/2fa/verify', tightAuthLimiter, validate(verifyTwoFactorBody), verifyTwoFactor);
router.post('/2fa/setup', tightAuthLimiter, requireUser, setupTwoFactorHandler);
router.post(
  '/2fa/enable',
  tightAuthLimiter,
  requireUser,
  validate(enableTwoFactorBody),
  enableTwoFactorHandler,
);
router.post(
  '/2fa/disable',
  tightAuthLimiter,
  requireUser,
  validate(disableTwoFactorBody),
  disableTwoFactorHandler,
);
router.post('/refresh', tightAuthLimiter, refresh);
router.post('/logout', logout);
router.get('/me', requireUser, me);

export default router;
