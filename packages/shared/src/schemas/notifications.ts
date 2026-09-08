import type { NotificationType } from '../constants';

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: NotificationView[];
  unreadCount: number;
}
