import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../constants';

export const notificationView = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  orderId: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationView = z.infer<typeof notificationView>;

export const notificationsResponse = z.object({
  items: z.array(notificationView),
  unreadCount: z.number().int(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponse>;
