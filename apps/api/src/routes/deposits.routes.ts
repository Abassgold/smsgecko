import { Router } from 'express';
import { requireVerified } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { idParams } from '../lib/validation/common.schema.js';
import { providerParams, depositsQuery } from '../lib/validation/deposits.schema.js';
import { createDepositBody } from '../lib/validation/deposits.schema.js';
import * as deposits from '../controllers/deposits.controller.js';

const router = Router();
router.post('/webhooks/payments/:provider', validate(providerParams, 'params'), deposits.webhook);
router.use('/deposits', requireVerified);
router.post('/deposits', validate(createDepositBody), deposits.create);
router.get('/deposits', validate(depositsQuery, 'query'), deposits.list);
router.get('/deposits/:id', validate(idParams, 'params'), deposits.getOne);

export default router;
