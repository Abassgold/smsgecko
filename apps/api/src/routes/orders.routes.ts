import { Router } from 'express';
import { requireVerified } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { idParams } from '../lib/validation/common.schema.js';
import { createOrderBody, ordersQuery } from '../lib/validation/orders.schema.js';
import * as orders from '../controllers/orders.controller.js';

const router = Router();
router.use(requireVerified);

router.post('/', validate(createOrderBody), orders.create);
router.get('/', validate(ordersQuery, 'query'), orders.list);
router.get('/stats', orders.stats);
router.get('/:id', validate(idParams, 'params'), orders.getOne);
router.post('/:id/cancel', validate(idParams, 'params'), orders.cancel);

export default router;
