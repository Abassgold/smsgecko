import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/validation/common.schema.js';
import {
  adminDepositsQuery,
  adminTransactionsQuery,
  updateDepositBody,
} from '../../lib/validation/admin/finance.schema.js';
import * as finance from '../../controllers/admin/finance.controller.js';

const router = Router();

router.get('/transactions', validate(adminTransactionsQuery, 'query'), finance.transactions);
router.get('/deposits', validate(adminDepositsQuery, 'query'), finance.deposits);
router.patch(
  '/deposits/:id',
  validate(idParams, 'params'),
  validate(updateDepositBody),
  finance.updateDeposit,
);

export default router;
