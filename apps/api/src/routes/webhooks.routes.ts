import { Router } from 'express';
import { validate } from '../middleware/validation.js';
import { smsWebhookParams } from '../lib/validation/webhooks.schema.js';
import * as webhooks from '../controllers/webhooks.controller.js';

const router = Router();

// Inbound SMS-code delivery, keyed by the provider's activation id.
// Public — matches how the upstream SMS providers post (no auth / signature).
router.post('/sms/:activationId', validate(smsWebhookParams, 'params'), webhooks.smsInbound);

export default router;
