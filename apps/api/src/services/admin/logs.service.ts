import type { AdminActionRow } from '@smsgecko/shared';
import { AdminAction, type AdminActionDoc } from '../../models/AdminAction.js';
import { User } from '../../models/User.js';
import type { AdminLogsQuery } from '../../lib/validation/admin/logs.schema.js';

function toRow(a: AdminActionDoc, email: string): AdminActionRow {
  return {
    id: a.id as string,
    admin: { id: String(a.adminId), email },
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId ?? null,
    detail: a.detail,
    createdAt: (a.get('createdAt') as Date).toISOString(),
  };
}

export async function listAdminActions(query: AdminLogsQuery) {
  const { targetType, targetId, page, limit } = query;
  const filter: Record<string, unknown> = {};
  if (targetType) filter.targetType = targetType;
  if (targetId) filter.targetId = targetId;

  const [rows, total] = await Promise.all([
    AdminAction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AdminAction.countDocuments(filter),
  ]);

  const admins = await User.find({ _id: { $in: rows.map((r) => r.adminId) } }, { email: 1 });
  const emails = new Map(admins.map((u) => [String(u._id), u.email]));

  const items = rows.map((r) => toRow(r, emails.get(String(r.adminId)) ?? '—'));
  return { items, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
