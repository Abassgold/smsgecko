import { Router } from 'express';
import { z } from 'zod';
import { parseUsd, v2CreateOrderBody } from '@smsgecko/shared';
import { Offer } from '../../models/Offer.js';
import { Service } from '../../models/Service.js';
import { Country } from '../../models/Country.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { requireApiKey } from '../../middleware/bearerAuth.js';
import {
  cancelOrder,
  createOrder,
  finishOrder,
  getOrderWithMessages,
} from '../orders/orders.service.js';
import { toV2Order, usdString } from './v2.mapper.js';

const idParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) });
const idempotencyHeader = z.string().min(8).max(128).optional();
const productsQuery = z.object({
  service: z.string().optional(),
  country: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const v2Router = Router();
v2Router.use(requireApiKey);

v2Router.get('/catalog/products', async (req, res) => {
  const q = parse(productsQuery, req.query);
  const filter: Record<string, unknown> = { active: true };
  if (q.service) {
    const svc = await Service.findOne({ slug: q.service.toLowerCase() });
    if (!svc) return res.json({ data: [] });
    filter.serviceId = svc._id;
  }
  if (q.country) {
    const ctry = await Country.findOne({ code: q.country.toLowerCase() });
    if (!ctry) return res.json({ data: [] });
    filter.countryId = ctry._id;
  }

  const offers = await Offer.find(filter).sort({ priceMicro: 1 }).limit(q.limit);
  const [services, countries] = await Promise.all([
    Service.find({ _id: { $in: offers.map((o) => o.serviceId) } }),
    Country.find({ _id: { $in: offers.map((o) => o.countryId) } }),
  ]);
  const svcMap = new Map(services.map((s) => [String(s._id), s]));
  const ctryMap = new Map(countries.map((c) => [String(c._id), c]));

  return res.json({
    data: offers.map((o) => {
      const s = svcMap.get(String(o.serviceId));
      const c = ctryMap.get(String(o.countryId));
      return {
        id: o.id as string,
        service: s?.name ?? 'Unknown',
        service_slug: s?.slug ?? '',
        country: c?.name ?? 'Unknown',
        country_code: c?.code ?? '',
        operator: o.operator ?? null,
        price: usdString(o.priceMicro),
        stock: o.stock,
      };
    }),
  });
});

v2Router.post('/orders', async (req, res) => {
  const body = parse(v2CreateOrderBody, req.body);
  const productId = body.catalog_product_id ?? body.product_id;
  if (!productId) throw badRequest('catalog_product_id (or product_id) is required');

  const offer = await Offer.findById(productId).catch(() => null);
  if (!offer || !offer.active) throw notFound('Unknown catalog_product_id');

  const maxPriceMicro = body.max_price ? parseUsd(body.max_price) : undefined;
  if (maxPriceMicro !== undefined && !Number.isFinite(maxPriceMicro)) {
    throw badRequest('max_price must be a decimal string, e.g. "0.50"');
  }

  const rawKey = req.headers['idempotency-key'];
  const idempotencyKey = parse(idempotencyHeader, typeof rawKey === 'string' ? rawKey : undefined);
  const { order, reused } = await createOrder(req.apiUser!, {
    serviceId: String(offer.serviceId),
    countryId: String(offer.countryId),
    offerId: String(offer._id),
    maxPriceMicro,
    idempotencyKey,
  });

  const { messages } = reused
    ? await getOrderWithMessages(req.apiUser!, order.id as string)
    : { messages: [] };
  res.status(201).json(toV2Order(order, messages));
});

v2Router.get('/orders/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { order, messages } = await getOrderWithMessages(req.apiUser!, id);
  res.json(toV2Order(order, messages));
});

v2Router.post('/orders/:id/finish', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const order = await finishOrder(req.apiUser!, id);
  const { messages } = await getOrderWithMessages(req.apiUser!, id);
  res.json(toV2Order(order, messages));
});

v2Router.post('/orders/:id/cancel', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const order = await cancelOrder(req.apiUser!, id);
  res.json(toV2Order(order));
});
