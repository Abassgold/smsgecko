import { AdminAction } from '../models/AdminAction.js';
import { logger } from './logger.js';

/**
 * Record an admin-panel mutation for the audit trail. Best-effort: a logging
 * failure must never block the admin action that triggered it.
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  target: { type: string; id?: string | null },
  detail = '',
): Promise<void> {
  try {
    await AdminAction.create({
      adminId,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      detail,
    });
  } catch (err) {
    logger.error({ err, adminId, action, target }, 'failed to record admin action');
  }
}
