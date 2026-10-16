import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { requireApiKey } from '../middleware/bearerAuth.js';
import { validate } from '../middleware/validation.js';
import { throttle } from '../middleware/throttle.js';
import { productsQuery, v2CreateOrderBody, v2IdBody, v2IdParams, v2PatchWebhookBody } from '../lib/validation/v2.schema.js';
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
// Two addresses, one handler: `/orders/create` reads better in docs and logs; `/orders` stays for existing integrations and the SDKs.
router.post(['/orders', '/orders/create'], validate(v2CreateOrderBody), createOrderHandler);
router.get('/orders/active', getActiveOrders);
/*
 * Body-style twins of the `/orders/:id/<action>` routes: `POST /orders/<action>` with `{ "id": "SG-..." }`. Both forms stay and run the
 * exact same handler. This step checks the body, hands the id on as the `:id` the handlers already read, then validates it like any address id.
 */
const idFromBody: RequestHandler[] = [
  validate(v2IdBody),
  (req, _res, next) => {
    req.params.id = (req.body as { id: string }).id;
    next();
  },
  validate(v2IdParams, 'params'),
];
// ONE throttle instance for both reactivate addresses: a throttle remembers its own last call, so two instances would let a client
// alternate between the addresses and skip the gap.
const reactivateThrottle = throttle(3000);
// Same idea for resend: it asks the provider for a real SMS, so don't let it be hammered. 5s matches the documented polling pace.
const resendThrottle = throttle(5000);
router.post('/orders/finish', ...idFromBody, finishOrderHandler);
router.post('/orders/cancel', ...idFromBody, cancelOrderHandler);
router.post('/orders/resend', resendThrottle, ...idFromBody, resendOrderHandler);
router.post('/orders/reactivate', reactivateThrottle, ...idFromBody, reactivateOrderHandler);
router.get('/orders/:id', validate(v2IdParams, 'params'), getOrder);
router.post('/orders/:id/finish', validate(v2IdParams, 'params'), finishOrderHandler);
router.post('/orders/:id/cancel', validate(v2IdParams, 'params'), cancelOrderHandler);
router.post('/orders/:id/resend', resendThrottle, validate(v2IdParams, 'params'), resendOrderHandler);
// A real second purchase from the provider + a real second wallet debit on
// a rapid double-call — throttled on top of the atomic lock in
// reactivateOrder() itself (see orders.service.ts), not instead of it.
router.post('/orders/:id/reactivate', reactivateThrottle, validate(v2IdParams, 'params'), reactivateOrderHandler);
router.get('/webhook', getWebhook);
router.patch('/webhook', validate(v2PatchWebhookBody), patchWebhook);
router.post('/webhook/test', testWebhookHandler);

const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
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
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};

router.use(notFound);
router.use(v2ErrorHandler);

export default router;
