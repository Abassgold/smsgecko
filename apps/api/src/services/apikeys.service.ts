import type { ApiKeyCreated, ApiKeyView } from '@smsgecko/shared';
import { ApiKey, type ApiKeyDoc } from '../models/ApiKey.js';
import type { UserDoc } from '../models/User.js';
import { notFound } from '../lib/errors.js';

export function toApiKeyView(k: ApiKeyDoc): ApiKeyView {
  return {
    id: k.id as string,
    prefix: k.prefix,
    label: k.label,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    revoked: Boolean(k.revokedAt),
    createdAt: (k.get('createdAt') as Date).toISOString(),
  };
}

export async function listKeys(user: UserDoc): Promise<ApiKeyView[]> {
  const keys = await ApiKey.find({ userId: user._id }).sort({ createdAt: -1 });
  return keys.map(toApiKeyView);
}

export async function createKey(user: UserDoc, label: string): Promise<ApiKeyCreated> {
  const { id, key, prefix } = await ApiKey.issue(user._id, label);
  const doc = await ApiKey.findById(id);
  return { ...toApiKeyView(doc!), prefix, key };
}

export async function revokeKey(user: UserDoc, id: string): Promise<void> {
  const result = await ApiKey.updateOne(
    { _id: id, userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (result.matchedCount === 0) throw notFound('API key not found');
}
