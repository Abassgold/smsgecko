import { Router } from 'express';
import { smsInbound } from '../controllers/webhooks.controller.js';
import { requireInboundSecret } from '../middleware/inboundWebhookAuth.js';

const router = Router();

// Inbound SMS-code delivery, already parsed by the upstream forwarder:
// { activationId, code }. Authenticated by a shared secret in the
// `X-Webhook-Secret` header (SMS_INBOUND_SECRET) — without it, anyone could
// force-complete an order with a forged OTP. See requireInboundSecret for the
// unset-secret fallback behaviour.
router.post('/sms', requireInboundSecret, smsInbound);

export default router;
