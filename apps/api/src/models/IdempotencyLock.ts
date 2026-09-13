import { Schema, model } from 'mongoose';

/**
 * A short-lived claim on one (userId, idempotency key) pair while `createOrder`
 * is mid-flight, so a second concurrent request with the same key gets
 * `REQUEST_IN_PROGRESS` instead of racing the first to create a duplicate
 * order. Released as soon as the request resolves (success or failure); the
 * TTL index is just a safety net if the process dies before that happens.
 */
const idempotencyLockSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 },
});

idempotencyLockSchema.index({ userId: 1, key: 1 }, { unique: true });

export const IdempotencyLock = model('IdempotencyLock', idempotencyLockSchema);
