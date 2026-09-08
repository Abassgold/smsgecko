import { asyncHandler } from '../../lib/asyncHandler.js';
import type { IdParams } from '../../lib/validation/common.schema.js';
import type { AdminOrdersQuery } from '../../lib/validation/admin/orders.schema.js';
import {
  cancelOrder,
  getOrderDetail,
  listOrders,
  repollOrder,
} from '../../services/admin/orders.service.js';

export const list = asyncHandler(async (req, res) => {
  const query = req.valid!.query as AdminOrdersQuery;
  const { items, total, totalPages } = await listOrders(query);
  res.json({ items, page: query.page, limit: query.limit, total, totalPages });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  res.json(await getOrderDetail(id));
});

export const cancel = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  res.json(await cancelOrder(id));
});

export const repoll = asyncHandler(async (req, res) => {
  const { id } = req.valid!.params as IdParams;
  res.json(await repollOrder(id));
});
