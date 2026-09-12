import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { requireApiKey } from '../middleware/bearerAuth.js';
import { validate } from '../middleware/validation.js';
import { productsQuery, v2CreateOrderBody, v2IdParams, v2PatchWebhookBody } from '../lib/validation/v2.schema.js';
import { classifyError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  cancelOrderHandler,
  createOrderHandler,
  finishOrderHandler,
  getActiveOrders,
  getBalance,
  getOrder,
  getWebhook,
  listProducts,
  patchWebhook,
  reactivateOrderHandler,
  resendOrderHandler,
  testWebhookHandler,
} from '../controllers/v2.controller.js';

const router = Router();
router.use(requireApiKey);

router.get('/balance', getBalance);
router.get('/catalog/products', validate(productsQuery, 'query'), listProducts);
router.post('/orders', validate(v2CreateOrderBody), createOrderHandler);
router.get('/orders/active', getActiveOrders);
router.get('/orders/:id', validate(v2IdParams, 'params'), getOrder);
router.post('/orders/:id/finish', validate(v2IdParams, 'params'), finishOrderHandler);
router.post('/orders/:id/cancel', validate(v2IdParams, 'params'), cancelOrderHandler);
router.post('/orders/:id/resend', validate(v2IdParams, 'params'), resendOrderHandler);
router.post('/orders/:id/reactivate', validate(v2IdParams, 'params'), reactivateOrderHandler);
router.get('/webhook', getWebhook);
router.patch('/webhook', validate(v2PatchWebhookBody), patchWebhook);
router.post('/webhook/test', testWebhookHandler);

const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'not_found', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
};

const v2ErrorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const classified = classifyError(error);
  if (classified) {
    return res.status(classified.status).json({ success: false, error: classified.body });
  }

  (req.log ?? logger).error({ err: error }, 'unhandled error');
  return res.status(500).json({
    success: false,
    error: { code: 'internal_error', message: 'Something went wrong' },
  });
};

router.use(notFound);
router.use(v2ErrorHandler);

export default router;
