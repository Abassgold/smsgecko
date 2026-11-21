import { Schema, model } from 'mongoose';

/** One browser/device that opted in to "code received" push notifications. */
const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  { timestamps: true },
);

export const PushSubscription = model('PushSubscription', pushSubscriptionSchema);
