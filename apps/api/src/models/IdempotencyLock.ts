import { Schema, model } from 'mongoose';

const idempotencyLockSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 },
});

idempotencyLockSchema.index({ userId: 1, key: 1 }, { unique: true });

export const IdempotencyLock = model('IdempotencyLock', idempotencyLockSchema);
