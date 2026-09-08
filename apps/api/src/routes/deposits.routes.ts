import { Router } from 'express';
import { requireVerified } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { idParams } from '../lib/validation/common.schema.js';
import { providerParams, webhookBody } from '../lib/validation/deposits.schema.js';
import { createDepositBody } from '../lib/validation/deposits.schema.js';
import * as deposits from '../controllers/deposits.controller.js';

const router = Router();

// Public webhook (no cookie auth) — declared before the requireVerified gate.
router.post(
  '/webhooks/payments/:provider',
  validate(providerParams, 'params'),
  validate(webhookBody),
  deposits.webhook,
);

router.use(requireVerified);

router.post('/deposits', validate(createDepositBody), deposits.create);
router.get('/deposits/:id', validate(idParams, 'params'), deposits.getOne);
router.post(
  '/deposits/:id/mock-confirm',
  validate(idParams, 'params'),
  deposits.mockConfirmHandler,
);

export default router;
