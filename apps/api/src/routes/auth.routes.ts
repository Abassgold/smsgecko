import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { tightAuthLimiter } from '../middleware/rateLimiters.js';
import { loginBody, registerBody, verifyEmailBody } from '../lib/validation/auth.schema.js';
import {
  login,
  logout,
  me,
  refresh,
  register,
  resendVerification,
  verifyEmail,
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', tightAuthLimiter, validate(registerBody), register);
router.post('/login', tightAuthLimiter, validate(loginBody), login);
router.post('/verify-email', tightAuthLimiter, validate(verifyEmailBody), verifyEmail);
router.post('/resend-verification', tightAuthLimiter, requireUser, resendVerification);
router.post('/refresh', tightAuthLimiter, refresh);
router.post('/logout', logout);
router.get('/me', requireUser, me);

export default router;
