import type { V2CreateOrderBody } from '@smsgecko/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validation.js';
import { badRequest, conflict } from '../lib/errors.js';
import { applyWebhookPatch, sendTestWebhook } from '../lib/webhooks.js';
import { idempotencyHeader, type ProductsQuery, type V2PatchWebhookBody } from '../lib/validation/v2.schema.js';
import {
  cancelOrder,
  finishOrder,
  getOrderWithMessages,
  listActiveOrders,
  reactivateOrder,
  resendOrder,
} from '../services/orders.service.js';
import { createV2Order, listCatalogProducts } from '../services/v2.service.js';
import { toV2Order, usdString } from '../services/v2.mapper.js';

/** Every /api/v2 response body: `{ success: true, data }` on success. */
const ok = <T>(data: T) => ({ success: true as const, data });

export const getBalance = asyncHandler(async (req, res) => {
  res.json(ok({ balance: usdString(req.apiUser!.balanceMicro) }));
});

export const listProducts = asyncHandler(async (req, res) => {
  const data = await listCatalogProducts(valid<ProductsQuery>(req, 'query'));
  res.json(ok(data));
});

export const createOrderHandler = asyncHandler(async (req, res) => {
  const rawKey = req.headers['idempotency-key'];
  let idempotencyKey: string | undefined;
  try {
    idempotencyKey =
      idempotencyHeader.validateSync(typeof rawKey === 'string' ? rawKey : undefined) ?? undefined;
  } catch {
    throw badRequest('Invalid Idempotency-Key header');
  }

  const { order, reused } = await createV2Order(
    req.apiUser!,
    req.body as V2CreateOrderBody,
    idempotencyKey,
  );
  const { messages } = reused
    ? await getOrderWithMessages(req.apiUser!, order.id as string)
    : { messages: [] };
  res.status(201).json(ok(toV2Order(order, messages)));
});

export const getOrder = asyncHandler(async (req, res) => {
  const { id } = valid<{ id: string }>(req, 'params');
  const { order, messages } = await getOrderWithMessages(req.apiUser!, id);
  res.json(ok(toV2Order(order, messages)));
});

export const finishOrderHandler = asyncHandler(async (req, res) => {
  const { id } = valid<{ id: string }>(req, 'params');
  const order = await finishOrder(req.apiUser!, id);
  const { messages } = await getOrderWithMessages(req.apiUser!, id);
  res.json(ok(toV2Order(order, messages)));
});

export const cancelOrderHandler = asyncHandler(async (req, res) => {
  const { id } = valid<{ id: string }>(req, 'params');
  const order = await cancelOrder(req.apiUser!, id);
  res.json(ok(toV2Order(order)));
});

export const getActiveOrders = asyncHandler(async (req, res) => {
  const items = await listActiveOrders(req.apiUser!);
  res.json(ok(items.map((o) => toV2Order(o))));
});

export const resendOrderHandler = asyncHandler(async (req, res) => {
  const { id } = valid<{ id: string }>(req, 'params');
  const order = await resendOrder(req.apiUser!, id);
  const { messages } = await getOrderWithMessages(req.apiUser!, id);
  res.json(ok(toV2Order(order, messages)));
});

export const reactivateOrderHandler = asyncHandler(async (req, res) => {
  const { id } = valid<{ id: string }>(req, 'params');
  const order = await reactivateOrder(req.apiUser!, id);
  const { messages } = await getOrderWithMessages(req.apiUser!, id);
  res.json(ok(toV2Order(order, messages)));
});

export const getWebhook = asyncHandler(async (req, res) => {
  const user = req.apiUser!;
  res.json(ok({ webhook_url: user.webhookUrl, webhook_secret: user.webhookSecret }));
});

export const patchWebhook = asyncHandler(async (req, res) => {
  const body = valid<V2PatchWebhookBody>(req, 'body');
  const user = req.apiUser!;
  await applyWebhookPatch(user, {
    webhookUrl: body.webhook_url,
    webhookSecret: body.webhook_secret,
    regenerateSecret: body.regenerate_secret,
  });
  res.json(ok({ webhook_url: user.webhookUrl, webhook_secret: user.webhookSecret }));
});

export const testWebhookHandler = asyncHandler(async (req, res) => {
  const user = req.apiUser!;
  if (!user.webhookUrl) {
    throw conflict('No webhook URL configured — set one with PATCH /webhook first');
  }
  res.json(ok(await sendTestWebhook(user)));
});
