import { asyncHandler } from '../../lib/asyncHandler.js';
import { valid } from '../../middleware/validation.js';
import type { AdminLogsQuery } from '../../lib/validation/admin/logs.schema.js';
import { listAdminActions } from '../../services/admin/logs.service.js';

export const list = asyncHandler(async (req, res) => {
  const query = valid<AdminLogsQuery>(req, 'query');
  const { items, total, totalPages } = await listAdminActions(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});
