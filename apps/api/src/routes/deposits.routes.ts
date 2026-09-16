import { Router } from 'express';
import { requireVerified } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { idParams } from '../lib/validation/common.schema.js';
import { providerParams, depositsQuery } from '../lib/validation/deposits.schema.js';
import { createDepositBody } from '../lib/validation/deposits.schema.js';
import * as deposits from '../controllers/deposits.controller.js';

const router = Router();

// Public webhook (no cookie auth) — declared before the requireVerified gate.
// Only the :provider route param is schema-validated; the body is NOT run
// through validate() here — stripUnknown would destroy Stripe's/NowPayments'
// actual payloads before handleWebhook() ever saw them. Each provider branch
// parses/verifies its own raw body instead (see deposits.service.ts).
router.post('/webhooks/payments/:provider', validate(providerParams, 'params'), deposits.webhook);

// Scoped to /deposits* — this router is mounted at the bare '/api/v1', so an
// unpathed router.use(requireVerified) here would match every path that falls
// through to it and 403 unrelated sibling routes (affiliate, api-keys,
// webhook, notifications, admin) registered after this one in app.ts.
router.use('/deposits', requireVerified);

router.post('/deposits', validate(createDepositBody), deposits.create);
router.get('/deposits', validate(depositsQuery, 'query'), deposits.list);
router.get('/deposits/:id', validate(idParams, 'params'), deposits.getOne);

export default router;
