import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { pushSubscribeBody, pushUnsubscribeBody } from '../lib/validation/push.schema.js';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as push from '../services/push.service.js';

const router = Router();
router.use(requireUser);

// What the browser needs to subscribe: whether push is on, and the public VAPID key.
router.get('/config', (_req, res) => {
  res.json({ enabled: push.pushEnabled(), publicKey: push.pushEnabled() ? env.VAPID_PUBLIC_KEY : null });
});

router.post(
  '/subscribe',
  validate(pushSubscribeBody),
  asyncHandler(async (req, res) => {
    await push.saveSubscription(String(req.authUser!._id), req.body as push.SubscriptionInput);
    res.status(204).end();
  }),
);

router.post(
  '/unsubscribe',
  validate(pushUnsubscribeBody),
  asyncHandler(async (req, res) => {
    await push.removeSubscription(String(req.authUser!._id), (req.body as { endpoint: string }).endpoint);
    res.status(204).end();
  }),
);

export default router;
