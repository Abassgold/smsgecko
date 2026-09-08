import type { CreateDepositBody } from '@smsgecko/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { env } from '../config/env.js';
import { forbidden } from '../lib/errors.js';
import type { IdParams } from '../lib/validation/common.schema.js';
import type { ProviderParams, WebhookBody } from '../lib/validation/deposits.schema.js';
import {
  createDeposit,
  getDeposit,
  handleWebhook,
  mockConfirm,
  toDepositView,
} from '../services/deposits.service.js';

export const webhook = asyncHandler(async (req, res) => {
  const { provider } = req.valid!.params as ProviderParams;
  res.json(await handleWebhook(provider, req.body as WebhookBody));
});

export const create = asyncHandler(async (req, res) => {
  const deposit = await createDeposit(req.authUser!, req.body as CreateDepositBody);
  res.status(201).json(toDepositView(deposit));
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  res.json(toDepositView(await getDeposit(req.authUser!, id)));
});

export const mockConfirmHandler = asyncHandler(async (req, res) => {
  if (!env.PAYMENTS_MOCK) throw forbidden('Mock confirmation is disabled');
  const { id } = req.valid!.params as IdParams;
  res.json(toDepositView(await mockConfirm(req.authUser!, id)));
});
