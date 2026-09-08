import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { NOTIFICATION_TYPES } from '@smsgecko/shared';

type Id = Types.ObjectId | string;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export type NotificationAttrs = InferSchemaType<typeof notificationSchema>;
export type NotificationDoc = HydratedDocument<NotificationAttrs>;
export const Notification = model('Notification', notificationSchema);

export async function notify(
  userId: Id,
  type: NotificationAttrs['type'],
  title: string,
  body = '',
  orderId?: Id,
): Promise<void> {
  await Notification.create({ userId, type, title, body, orderId: orderId ?? null });
}
