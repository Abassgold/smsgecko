import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { tightAuthLimiter } from '../middleware/rateLimiters.js';
import { loginBody, registerBody, verifyEmailBody } from '../lib/validation/auth.schema.js';
import * as auth from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', tightAuthLimiter, validate(registerBody), auth.register);
router.post('/login', tightAuthLimiter, validate(loginBody), auth.login);
router.post('/verify-email', tightAuthLimiter, validate(verifyEmailBody), auth.verifyEmail);
router.post('/resend-verification', tightAuthLimiter, requireUser, auth.resendVerification);
router.post('/refresh', tightAuthLimiter, auth.refresh);
router.post('/logout', auth.logout);
router.get('/me', requireUser, auth.me);

export default router;
