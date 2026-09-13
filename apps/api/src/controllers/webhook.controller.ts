import type { UpdateWebhookBody } from '@smsgecko/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validation.js';
import { conflict } from '../lib/errors.js';
import { applyWebhookPatch, sendTestWebhook } from '../lib/webhooks.js';

export const getWebhook = asyncHandler(async (req, res) => {
  const user = req.authUser!;
  res.json({ webhookUrl: user.webhookUrl, webhookSecret: user.webhookSecret });
});

export const patchWebhook = asyncHandler(async (req, res) => {
  const body = valid<UpdateWebhookBody>(req, 'body');
  const user = req.authUser!;
  await applyWebhookPatch(user, body);
  res.json({ webhookUrl: user.webhookUrl, webhookSecret: user.webhookSecret });
});

export const testWebhook = asyncHandler(async (req, res) => {
  const user = req.authUser!;
  if (!user.webhookUrl) {
    throw conflict('No webhook URL configured — set one first');
  }
  res.json(await sendTestWebhook(user));
});
