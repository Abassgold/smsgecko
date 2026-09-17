import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const BROADCAST_AUDIENCES = ['all', 'verified'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export const BROADCAST_STATUSES = ['pending', 'sending', 'completed', 'failed'] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

/**
 * One admin-triggered mass email. Sending itself happens in the background
 * (workers/index.ts#runBroadcasts), a batch of recipients per worker tick —
 * this document is both the job queue entry and the progress/history
 * record, same pattern as Order for the SMS-polling worker.
 */
const broadcastSchema = new Schema(
  {
    subject: { type: String, required: true, trim: true },
    /** Plain text; wrapped in the shared HTML template at send time (see
     * lib/email.ts#sendBroadcastEmail). No admin-authored HTML/script risk. */
    body: { type: String, required: true },
    audience: { type: String, enum: BROADCAST_AUDIENCES, default: 'all' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: { type: String, enum: BROADCAST_STATUSES, default: 'pending', index: true },
    /** Snapshotted once, when the worker picks the job up — the audience
     * query result doesn't change mid-send even if new users sign up. */
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    /** Last processed recipient's _id — resumable paging across worker
     * ticks, same idea as Order.lastPolledAt driving the polling worker. */
    cursor: { type: Schema.Types.ObjectId, default: null },
    /** Short lease held while a worker is actively mid-batch on this job —
     * lets runBroadcasts() claim a `sending` job atomically (not just a
     * `pending` one), so two worker processes can never both be sending
     * the same broadcast at once. Cleared after each batch; a stale lease
     * (holder crashed mid-batch) is free for anyone's next tick to take. */
    lockedUntil: { type: Date, default: null },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

export type BroadcastAttrs = InferSchemaType<typeof broadcastSchema>;
export type BroadcastDoc = HydratedDocument<BroadcastAttrs>;
export const Broadcast = model('Broadcast', broadcastSchema);
