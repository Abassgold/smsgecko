import { parseUsd } from '@smsgecko/shared';
import type { V2CreateOrderBody, V2Product } from '@smsgecko/shared';
import { Offer } from '../models/Offer.js';
import { Service } from '../models/Service.js';
import { Country } from '../models/Country.js';
import type { UserDoc } from '../models/User.js';
import { badRequest, notFound } from '../lib/errors.js';
import { createOrder, type CreateOrderResult } from './orders.service.js';
import { usdString } from './v2.mapper.js';
import type { ProductsQuery } from '../lib/validation/v2.schema.js';

export async function listCatalogProducts(q: ProductsQuery): Promise<V2Product[]> {
  const filter: Record<string, unknown> = { active: true };
  if (q.service) {
    const svc = await Service.findOne({ slug: q.service.toLowerCase() });
    if (!svc) return [];
    filter.serviceId = svc._id;
  }
  if (q.country) {
    const ctry = await Country.findOne({ code: q.country.toLowerCase() });
    if (!ctry) return [];
    filter.countryId = ctry._id;
  }

  const offers = await Offer.find(filter).sort({ priceMicro: 1 }).limit(q.limit);
  const [services, countries] = await Promise.all([
    Service.find({ _id: { $in: offers.map((o) => o.serviceId) } }),
    Country.find({ _id: { $in: offers.map((o) => o.countryId) } }),
  ]);
  const svcMap = new Map(services.map((s) => [String(s._id), s]));
  const ctryMap = new Map(countries.map((c) => [String(c._id), c]));

  return offers.map((o) => {
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
  });
}

export async function createV2Order(
  apiUser: UserDoc,
  body: V2CreateOrderBody,
  idempotencyKey: string | undefined,
): Promise<CreateOrderResult> {
  const productId = body.catalog_product_id ?? body.product_id;
  if (!productId) throw badRequest('catalog_product_id (or product_id) is required');

  const offer = await Offer.findById(productId).catch(() => null);
  if (!offer || !offer.active) throw notFound('Unknown catalog_product_id');

  const maxPriceMicro = body.max_price ? parseUsd(body.max_price) : undefined;
  if (maxPriceMicro !== undefined && !Number.isFinite(maxPriceMicro)) {
    throw badRequest('max_price must be a decimal string, e.g. "0.50"');
  }

  return createOrder(apiUser, {
    serviceId: String(offer.serviceId),
    countryId: String(offer.countryId),
    offerId: String(offer._id),
    maxPriceMicro,
    idempotencyKey,
  });
}
