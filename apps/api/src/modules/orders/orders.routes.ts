import { Router } from 'express';
import { z } from 'zod';
import { createOrderBody, objectId, ordersQuery } from '@smsgecko/shared';
import { toOrderView } from './orders.mapper.js';
import { cancelOrder, createOrder, getOrderWithMessages, listOrders } from './orders.service.js';
import { getOrderStats } from './orders.stats.js';
import { parse } from '../../lib/validate.js';
import { requireVerified } from '../../middleware/auth.js';

const idParams = z.object({ id: objectId });

export const orderRouter = Router();
orderRouter.use(requireVerified);

orderRouter.post('/', async (req, res) => {
  const { order, reused } = await createOrder(req.authUser!, parse(createOrderBody, req.body));
  const { messages } = reused
    ? await getOrderWithMessages(req.authUser!, order.id as string)
    : { messages: [] };
  res.status(201).json(toOrderView(order, messages));
});

orderRouter.get('/', async (req, res) => {
  const { status, page, limit } = parse(ordersQuery, req.query);
  const { items, total, totalPages } = await listOrders(req.authUser!, { status, page, limit });
  res.json({
    items: items.map((o) => toOrderView(o)),
    page,
    limit,
    total,
    totalPages,
  });
});

orderRouter.get('/stats', async (req, res) => {
  res.json(await getOrderStats(req.authUser!));
});

orderRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { order, messages } = await getOrderWithMessages(req.authUser!, id);
  res.json(toOrderView(order, messages));
});

orderRouter.post('/:id/cancel', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const order = await cancelOrder(req.authUser!, id);
  res.json(toOrderView(order));
});
