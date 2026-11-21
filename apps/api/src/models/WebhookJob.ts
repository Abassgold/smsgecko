import { Schema, model } from 'mongoose';

/**
 * One webhook event waiting to be delivered (or already delivered). Kept in the database, not in memory, so a server
 * restart never loses a retry. The body is stored exactly as first built, so every attempt sends the same bytes and the
 * same signature, and the receiver can use the delivery id (this row's _id) to ignore a duplicate.
 */
const webhookJobSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    event: { type: String, required: true },
    payload: { type: String, required: true },
    status: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
    /** Attempts started so far. Counted when an attempt begins, so a crash mid-attempt can never loop forever. */
    attempts: { type: Number, default: 0 },
    /** When the next attempt is due. While an attempt runs this holds a short lease so no other worker takes the job. */
    nextAttemptAt: { type: Date, required: true },
    lastStatusCode: { type: Number, default: null },
    lastError: { type: String, default: null },
    /** Set once delivered or given up; a TTL index removes the row two weeks later. */
    doneAt: { type: Date, default: null },
  },
  { timestamps: true },
);
webhookJobSchema.index({ status: 1, nextAttemptAt: 1 });
webhookJobSchema.index({ doneAt: 1 }, { expireAfterSeconds: 14 * 24 * 3600 });

export const WebhookJob = model('WebhookJob', webhookJobSchema);
