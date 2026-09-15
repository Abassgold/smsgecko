import type { CreateDepositBody } from '@smsgecko/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validation.js';
import { env } from '../config/env.js';
import { forbidden } from '../lib/errors.js';
import type { IdParams } from '../lib/validation/common.schema.js';
import type { DepositsQuery, ProviderParams } from '../lib/validation/deposits.schema.js';
import {
  createDeposit,
  getDeposit,
  handleWebhook,
  listDeposits,
  mockConfirm,
  toDepositView,
} from '../services/deposits.service.js';

export const webhook = asyncHandler(async (req, res) => {
  const { provider } = valid<ProviderParams>(req, 'params');
  res.json(await handleWebhook(provider, req));
});

export const create = asyncHandler(async (req, res) => {
  const deposit = await createDeposit(req.authUser!, req.body as CreateDepositBody);
  res.status(201).json(toDepositView(deposit));
});

export const list = asyncHandler(async (req, res) => {
  const { status, page, limit } = valid<DepositsQuery>(req, 'query');
  const { items, total, totalPages, counts } = await listDeposits(req.authUser!, {
    status,
    page,
    limit,
  });
  res.json({ items, page, limit, total, totalPages, counts });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  res.json(toDepositView(await getDeposit(req.authUser!, id)));
});

export const mockConfirmHandler = asyncHandler(async (req, res) => {
  if (!env.PAYMENTS_MOCK) throw forbidden('Mock confirmation is disabled');
  const { id } = valid<IdParams>(req, 'params');
  res.json(toDepositView(await mockConfirm(req.authUser!, id)));
});
