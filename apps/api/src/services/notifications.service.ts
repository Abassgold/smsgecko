import type { NotificationView, NotificationsResponse } from '@smsgecko/shared';
import { Notification, type NotificationDoc } from '../models/Notification.js';
import type { UserDoc } from '../models/User.js';

export function toNotificationView(n: NotificationDoc): NotificationView {
  return {
    id: n.id as string,
    type: n.type,
    title: n.title,
    body: n.body,
    orderId: n.orderId ? String(n.orderId) : null,
    read: Boolean(n.readAt),
    createdAt: (n.get('createdAt') as Date).toISOString(),
  };
}

export async function getNotifications(user: UserDoc): Promise<NotificationsResponse> {
  const [items, unreadCount] = await Promise.all([
    Notification.find({ userId: user._id }).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ userId: user._id, readAt: null }),
  ]);
  return { items: items.map(toNotificationView), unreadCount };
}

export async function markAllRead(user: UserDoc): Promise<void> {
  await Notification.updateMany(
    { userId: user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );
}
