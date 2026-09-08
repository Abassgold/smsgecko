import { Router } from 'express';
import { z } from 'zod';
import {
  createProviderBody,
  objectId,
  reorderProvidersBody,
  updateProviderBody,
} from '@smsgecko/shared';
import { ProviderConfig } from '../../models/ProviderConfig.js';
import { Order } from '../../models/Order.js';
import { encryptJson } from '../../lib/secretbox.js';
import { bustProviderCache, runHealthCheck } from '../../providers/sms/registry.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { mergeConfigPatch, toProviderView } from './providers.helpers.js';

const idParams = z.object({ id: objectId });

export const adminProviderRouter = Router();

adminProviderRouter.get('/', async (_req, res) => {
  const configs = await ProviderConfig.find().sort({ priority: 1, createdAt: 1 });
  res.json(configs.map(toProviderView));
});

adminProviderRouter.post('/', async (req, res) => {
  const body = parse(createProviderBody, req.body);
  if (await ProviderConfig.exists({ label: body.label })) {
    throw conflict('A provider with that label already exists');
  }
  const cfg = await ProviderConfig.create({
    key: body.key,
    label: body.label,
    enabled: body.enabled,
    priority: body.priority,
    configEnc: encryptJson(body.config ?? {}),
  });
  bustProviderCache();
  res.status(201).json(toProviderView(cfg));
});

adminProviderRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const cfg = await ProviderConfig.findById(id);
  if (!cfg) throw notFound('Provider not found');
  res.json(toProviderView(cfg));
});

adminProviderRouter.patch('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateProviderBody, req.body);
  const cfg = await ProviderConfig.findById(id);
  if (!cfg) throw notFound('Provider not found');

  if (body.label !== undefined) {
    if (await ProviderConfig.exists({ label: body.label, _id: { $ne: cfg._id } })) {
      throw conflict('A provider with that label already exists');
    }
    cfg.label = body.label;
  }
  if (body.enabled !== undefined) cfg.enabled = body.enabled;
  if (body.priority !== undefined) cfg.priority = body.priority;
  if (body.config !== undefined) {
    cfg.configEnc = encryptJson(mergeConfigPatch(cfg, body.config));
  }
  await cfg.save();
  bustProviderCache();
  res.json(toProviderView(cfg));
});

adminProviderRouter.delete('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const cfg = await ProviderConfig.findById(id);
  if (!cfg) throw notFound('Provider not found');
  const active = await Order.countDocuments({ providerConfigId: cfg._id, status: 'waiting' });
  if (active > 0) {
    throw badRequest(`${active} order(s) are still waiting on this provider — disable it instead`);
  }
  await cfg.deleteOne();
  bustProviderCache();
  res.json({ ok: true as const });
});

adminProviderRouter.post('/:id/test', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const cfg = await ProviderConfig.findById(id);
  if (!cfg) throw notFound('Provider not found');
  const result = await runHealthCheck(cfg);
  bustProviderCache();
  res.json(result);
});

adminProviderRouter.post('/reorder', async (req, res) => {
  const { orderedIds } = parse(reorderProvidersBody, req.body);
  await Promise.all(
    orderedIds.map((id, i) => ProviderConfig.updateOne({ _id: id }, { $set: { priority: i } })),
  );
  bustProviderCache();
  const configs = await ProviderConfig.find().sort({ priority: 1, createdAt: 1 });
  res.json(configs.map(toProviderView));
});
