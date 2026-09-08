import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { transactionsQuery } from '../lib/validation/wallet.schema.js';
import * as wallet from '../controllers/wallet.controller.js';

const router = Router();
// `requireUser` is applied per-route (not as a blanket `.use`) so unmatched
// paths fall through to the deposits router, also mounted on /api/v1 (incl. the
// public payment webhook).

router.get('/wallet', requireUser, wallet.getBalance);
router.get(
  '/transactions',
  requireUser,
  validate(transactionsQuery, 'query'),
  wallet.listTransactionsHandler,
);
router.get('/transactions/export.csv', requireUser, wallet.exportCsv);

export default router;
