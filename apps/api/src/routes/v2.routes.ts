import { Router } from 'express';
import { requireApiKey } from '../middleware/bearerAuth.js';
import { validate } from '../middleware/validation.js';
import { productsQuery, v2CreateOrderBody, v2IdParams } from '../lib/validation/v2.schema.js';
import * as v2 from '../controllers/v2.controller.js';

const router = Router();
router.use(requireApiKey);

router.get('/catalog/products', validate(productsQuery, 'query'), v2.listProducts);
router.post('/orders', validate(v2CreateOrderBody), v2.createOrderHandler);
router.get('/orders/active', v2.getActiveOrders);
router.get('/orders/:id', validate(v2IdParams, 'params'), v2.getOrder);
router.post('/orders/:id/finish', validate(v2IdParams, 'params'), v2.finishOrderHandler);
router.post('/orders/:id/cancel', validate(v2IdParams, 'params'), v2.cancelOrderHandler);
router.post('/orders/:id/resend', validate(v2IdParams, 'params'), v2.resendOrderHandler);
router.post('/orders/:id/reactivate', validate(v2IdParams, 'params'), v2.reactivateOrderHandler);

export default router;
