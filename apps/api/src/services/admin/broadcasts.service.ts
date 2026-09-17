import type { BroadcastRow, CreateBroadcastBody } from '@smsgecko/shared';
import { Broadcast, type BroadcastDoc } from '../../models/Broadcast.js';
import { User } from '../../models/User.js';
import { logAdminAction } from '../../lib/adminLog.js';
import { notFound } from '../../lib/errors.js';
import type { AdminBroadcastsQuery } from '../../lib/validation/admin/broadcasts.schema.js';

function toRow(b: BroadcastDoc, adminEmail: string): BroadcastRow {
  return {
    id: b.id as string,
    subject: b.subject,
    body: b.body,
    audience: b.audience,
    createdBy: { id: String(b.createdBy), email: adminEmail },
    status: b.status,
    totalRecipients: b.totalRecipients,
    sentCount: b.sentCount,
    failedCount: b.failedCount,
    startedAt: b.startedAt ? b.startedAt.toISOString() : null,
    completedAt: b.completedAt ? b.completedAt.toISOString() : null,
    createdAt: (b.get('createdAt') as Date).toISOString(),
  };
}

/** Creates the job — the actual sending happens in the background
 * (workers/index.ts#runBroadcasts), picked up on its next tick. */
export async function createBroadcast(
  actingUserId: string,
  body: CreateBroadcastBody,
): Promise<BroadcastRow> {
  const doc = await Broadcast.create({
    subject: body.subject,
    body: body.body,
    audience: body.audience,
    createdBy: actingUserId,
    status: 'pending',
  });
  void logAdminAction(
    actingUserId,
    'broadcast_create',
    { type: 'broadcast', id: doc.id as string },
    `"${body.subject}" to ${body.audience}`,
  );
  const admin = await User.findById(actingUserId);
  return toRow(doc, admin?.email ?? '—');
}

export async function listBroadcasts(query: AdminBroadcastsQuery) {
  const { page, limit } = query;
  const [rows, total] = await Promise.all([
    Broadcast.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Broadcast.countDocuments(),
  ]);

  const admins = await User.find({ _id: { $in: rows.map((r) => r.createdBy) } }, { email: 1 });
  const emails = new Map(admins.map((u) => [String(u._id), u.email]));

  const items = rows.map((r) => toRow(r, emails.get(String(r.createdBy)) ?? '—'));
  return { items, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getBroadcast(id: string): Promise<BroadcastRow> {
  const doc = await Broadcast.findById(id);
  if (!doc) throw notFound('Broadcast not found');
  const admin = await User.findById(doc.createdBy);
  return toRow(doc, admin?.email ?? '—');
}
