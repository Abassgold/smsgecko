import { Router } from 'express';
import { Notification, type NotificationDoc } from '../../models/Notification.js';
import { requireUser } from '../../middleware/auth.js';

function toView(n: NotificationDoc) {
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

export const notificationRouter = Router();
notificationRouter.use(requireUser);

notificationRouter.get('/', async (req, res) => {
  const [items, unreadCount] = await Promise.all([
    Notification.find({ userId: req.authUser!._id }).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ userId: req.authUser!._id, readAt: null }),
  ]);
  res.json({ items: items.map(toView), unreadCount });
});

notificationRouter.post('/read', async (req, res) => {
  await Notification.updateMany(
    { userId: req.authUser!._id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  res.json({ ok: true as const });
});
