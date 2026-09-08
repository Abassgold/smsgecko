import { Router } from 'express';
import { z } from 'zod';
import { createDepositBody, objectId } from '@smsgecko/shared';
import { env } from '../../config/env.js';
import { forbidden } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { requireVerified } from '../../middleware/auth.js';
import {
  createDeposit,
  getDeposit,
  handleWebhook,
  mockConfirm,
  toDepositView,
} from './deposits.service.js';

const idParams = z.object({ id: objectId });
const providerParams = z.object({ provider: z.string() });
const webhookBody = z.object({ providerRef: z.string().optional(), status: z.string().optional() });

export const depositRouter = Router();

// Public webhook (no cookie auth) — declared before the requireUser gate.
depositRouter.post('/webhooks/payments/:provider', async (req, res) => {
  const { provider } = parse(providerParams, req.params);
  res.json(await handleWebhook(provider, parse(webhookBody, req.body)));
});

depositRouter.use(requireVerified);

depositRouter.post('/deposits', async (req, res) => {
  const deposit = await createDeposit(req.authUser!, parse(createDepositBody, req.body));
  res.status(201).json(toDepositView(deposit));
});

depositRouter.get('/deposits/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  res.json(toDepositView(await getDeposit(req.authUser!, id)));
});

depositRouter.post('/deposits/:id/mock-confirm', async (req, res) => {
  if (!env.PAYMENTS_MOCK) throw forbidden('Mock confirmation is disabled');
  const { id } = parse(idParams, req.params);
  res.json(toDepositView(await mockConfirm(req.authUser!, id)));
});
