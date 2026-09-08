import { Router } from 'express';
import { settingsPatch } from '@smsgecko/shared';
import { getSettings, updateSettings } from '../../lib/settings.js';
import { badRequest } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';

export const adminSettingsRouter = Router();

adminSettingsRouter.get('/', async (_req, res) => {
  res.json(await getSettings());
});

adminSettingsRouter.patch('/', async (req, res) => {
  const body = parse(settingsPatch, req.body);
  const merged = { ...(await getSettings()), ...body };
  if (merged.mockSmsMinDelayMs > merged.mockSmsMaxDelayMs) {
    throw badRequest('mockSmsMinDelayMs must be ≤ mockSmsMaxDelayMs');
  }
  res.json(await updateSettings(body));
});
