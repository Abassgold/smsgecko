import type { CreateOrderBody } from '@smsgecko/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validation.js';
import type { IdParams } from '../lib/validation/common.schema.js';
import type { OrdersQuery } from '../lib/validation/orders.schema.js';
import { toOrderView } from '../services/orders.mapper.js';
import {
  cancelOrder,
  createOrder,
  getOrderWithMessages,
  listOrders,
} from '../services/orders.service.js';
import { getOrderStats } from '../services/orders.stats.js';

export const create = asyncHandler(async (req, res) => {
  const { order, reused } = await createOrder(req.authUser!, req.body as CreateOrderBody);
  const { messages } = reused
    ? await getOrderWithMessages(req.authUser!, order.id as string)
    : { messages: [] };
  res.status(201).json(toOrderView(order, messages));
});

export const list = asyncHandler(async (req, res) => {
  const { status, page, limit } = valid<OrdersQuery>(req, 'query');
  const { items, total, totalPages } = await listOrders(req.authUser!, { status, page, limit });
  res.json({ items: items.map((o: any) => toOrderView(o)), page, limit, total, totalPages });
});

export const stats = asyncHandler(async (req, res) => {
  res.json(await getOrderStats(req.authUser!));
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  const { order, messages } = await getOrderWithMessages(req.authUser!, id);
  res.json(toOrderView(order, messages));
});

export const cancel = asyncHandler(async (req, res) => {
  const { id } = valid<IdParams>(req, 'params');
  const order = await cancelOrder(req.authUser!, id);
  res.json(toOrderView(order));
});
