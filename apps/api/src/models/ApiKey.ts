import { Schema, model, type InferSchemaType, type HydratedDocument, type Model } from 'mongoose';
import { API_KEY_LIVE_PREFIX } from '@smsgecko/shared';
import { randomToken, sha256 } from '../lib/crypto.js';

const apiKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    prefix: { type: String, required: true },
    hashedKey: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

interface ApiKeyModel extends Model<InferSchemaType<typeof apiKeySchema>> {
  issue(userId: unknown, label: string): Promise<{ id: string; key: string; prefix: string }>;
  verify(rawKey: string): Promise<HydratedDocument<InferSchemaType<typeof apiKeySchema>> | null>;
}

apiKeySchema.static('issue', async function issue(userId: unknown, label: string) {
  const secret = randomToken(24);
  const key = `${API_KEY_LIVE_PREFIX}${secret}`;
  const doc = await this.create({
    userId,
    prefix: key.slice(0, API_KEY_LIVE_PREFIX.length + 6),
    hashedKey: sha256(key),
    label,
  });
  return { id: doc.id as string, key, prefix: doc.prefix };
});

apiKeySchema.static('verify', async function verify(rawKey: string) {
  if (!rawKey.startsWith(API_KEY_LIVE_PREFIX)) return null;
  const doc = await this.findOne({ hashedKey: sha256(rawKey), revokedAt: null });
  return doc;
});

export type ApiKeyAttrs = InferSchemaType<typeof apiKeySchema>;
export type ApiKeyDoc = HydratedDocument<ApiKeyAttrs>;
export const ApiKey = model<ApiKeyAttrs, ApiKeyModel>('ApiKey', apiKeySchema);
