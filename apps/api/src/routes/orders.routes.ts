import { Router } from 'express';
import { requireVerified } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { throttle } from '../middleware/throttle.js';
import { idParams } from '../lib/validation/common.schema.js';
import { createOrderBody, ordersQuery } from '../lib/validation/orders.schema.js';
import * as orders from '../controllers/orders.controller.js';

const router = Router();
router.use(requireVerified);

router.post('/', validate(createOrderBody), orders.create);
router.get('/', validate(ordersQuery, 'query'), orders.list);
router.get('/stats', orders.stats);
router.get('/active', orders.active);
router.get('/:id', validate(idParams, 'params'), orders.getOne);
router.post('/:id/cancel', validate(idParams, 'params'), orders.cancel);
router.post('/:id/resend', validate(idParams, 'params'), orders.resend);
// A real second purchase from the provider + a real second wallet debit on
// a rapid double-click — throttled on top of the atomic lock in
// reactivateOrder() itself (see orders.service.ts), not instead of it.
router.post('/:id/reactivate', throttle(3000), validate(idParams, 'params'), orders.reactivate);

export default router;
