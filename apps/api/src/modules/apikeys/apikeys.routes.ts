import { Router } from 'express';
import { z } from 'zod';
import { createApiKeyBody, objectId } from '@smsgecko/shared';
import { ApiKey, type ApiKeyDoc } from '../../models/ApiKey.js';
import { notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { requireUser } from '../../middleware/auth.js';

const idParams = z.object({ id: objectId });

function toApiKeyView(k: ApiKeyDoc) {
  return {
    id: k.id as string,
    prefix: k.prefix,
    label: k.label,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    revoked: Boolean(k.revokedAt),
    createdAt: (k.get('createdAt') as Date).toISOString(),
  };
}

export const apiKeyRouter = Router();
apiKeyRouter.use(requireUser);

apiKeyRouter.get('/', async (req, res) => {
  const keys = await ApiKey.find({ userId: req.authUser!._id }).sort({ createdAt: -1 });
  res.json(keys.map(toApiKeyView));
});

apiKeyRouter.post('/', async (req, res) => {
  const { label } = parse(createApiKeyBody, req.body);
  const { id, key, prefix } = await ApiKey.issue(req.authUser!._id, label);
  const doc = await ApiKey.findById(id);
  res.status(201).json({ ...toApiKeyView(doc!), prefix, key });
});

apiKeyRouter.delete('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const result = await ApiKey.updateOne(
    { _id: id, userId: req.authUser!._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (result.matchedCount === 0) throw notFound('API key not found');
  res.json({ ok: true as const });
});
