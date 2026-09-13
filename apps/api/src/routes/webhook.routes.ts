import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { updateWebhookBody } from '../lib/validation/webhook.schema.js';
import * as webhook from '../controllers/webhook.controller.js';

const router = Router();
router.use(requireUser);

router.get('/', webhook.getWebhook);
router.patch('/', validate(updateWebhookBody), webhook.patchWebhook);
router.post('/test', webhook.testWebhook);

export default router;
