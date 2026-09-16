import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { transactionsQuery } from '../lib/validation/wallet.schema.js';
import { exportCsv, getBalance, listTransactionsHandler } from '../controllers/wallet.controller.js';

const router = Router();
router.get('/wallet', requireUser, getBalance);
router.get(
  '/transactions',
  requireUser,
  validate(transactionsQuery, 'query'),
  listTransactionsHandler,
);
router.get('/transactions/export.csv', requireUser, exportCsv);

export default router;
