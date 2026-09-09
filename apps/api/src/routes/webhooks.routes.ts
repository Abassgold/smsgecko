import { Router } from 'express';
import { smsInbound } from '../controllers/webhooks.controller.js';

const router = Router();

// Inbound SMS-code delivery, already parsed by the upstream backend:
// { activationId, code }. Public — no auth / signature.
router.post('/sms', smsInbound);

export default router;
