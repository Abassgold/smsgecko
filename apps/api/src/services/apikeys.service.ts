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

/**
 * One active key per account — like GitHub's/Stripe's single-token
 * "regenerate" model, not a list of many live keys. Revoked keys still exist
 * in the collection (audit trail, and `ApiKey.verify` already excludes them
 * from auth), they're just not surfaced here.
 */
export async function listKeys(user: UserDoc): Promise<ApiKeyView[]> {
  const keys = await ApiKey.find({ userId: user._id, revokedAt: null }).sort({ createdAt: -1 });
  return keys.map(toApiKeyView);
}

/** Revokes any key(s) currently active for this user before issuing the new
 * one, so generating always replaces rather than piling up. */
export async function createKey(user: UserDoc, label: string): Promise<ApiKeyCreated> {
  await ApiKey.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
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
