import { asyncHandler } from '../lib/asyncHandler.js';
import { getNotifications, markAllRead } from '../services/notifications.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await getNotifications(req.authUser!));
});

export const readAll = asyncHandler(async (req, res) => {
  await markAllRead(req.authUser!);
  res.json({ ok: true as const });
});
