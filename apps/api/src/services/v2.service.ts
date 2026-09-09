import { parseUsd } from '@smsgecko/shared';
import type { V2CreateOrderBody, V2Product } from '@smsgecko/shared';
import type { UserDoc } from '../models/User.js';
import { badRequest } from '../lib/errors.js';
import { getSettings } from '../lib/settings.js';
import { createOrder, type CreateOrderResult } from './orders.service.js';
import { priceTiers, searchCountries, searchServices } from './catalog.service.js';
import { usdString } from './v2.mapper.js';
import type { ProductsQuery } from '../lib/validation/v2.schema.js';

/**
 * `?service=` unset → the active provider's service list (discovery, no prices).
 * `?service=` set → priced products per country (× tier). `?country=` narrows it.
 * `id` is `"<serviceCode>::<countryCode>[::<tierIndex>]"`.
 */
export async function listCatalogProducts(q: ProductsQuery): Promise<V2Product[]> {
  if (!q.service) {
    const services = await searchServices(undefined, q.limit);
    return services.map((s) => ({
      id: s.id,
      service: s.name,
      service_slug: s.slug,
      country: '',
      country_code: '',
      operator: null,
      price: '0',
      stock: 0,
    }));
  }

  const serviceCode = q.service;
  const countries = await searchCountries(undefined, 1000);
  const wanted = q.country
    ? countries.filter((c) => c.code.toLowerCase() === q.country!.toLowerCase())
    : countries;

  const settings = await getSettings();
  const out: V2Product[] = [];
  for (const c of wanted) {
    const tiers = await priceTiers(serviceCode, c.code, settings);
    tiers.forEach((t, i) => {
      out.push({
        id: i === 0 ? `${serviceCode}::${c.code}` : `${serviceCode}::${c.code}::${i}`,
        service: serviceCode,
        service_slug: serviceCode,
        country: c.name,
        country_code: c.code,
        operator: t.operator,
        price: usdString(t.priceMicro),
        stock: t.stock ?? 0,
      });
    });
    if (out.length >= q.limit) break;
  }
  return out.slice(0, q.limit);
}

export async function createV2Order(
  apiUser: UserDoc,
  body: V2CreateOrderBody,
  idempotencyKey: string | undefined,
): Promise<CreateOrderResult> {
  const productId = body.catalog_product_id ?? body.product_id;
  if (!productId) throw badRequest('catalog_product_id (or product_id) is required');

  const parts = productId.split('::');
  if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) {
    throw badRequest(
      'catalog_product_id must be "<service>::<country>[::<tier>]" from /v2/catalog/products',
    );
  }

  const maxPriceMicro = body.max_price ? parseUsd(body.max_price) : undefined;
  if (maxPriceMicro !== undefined && !Number.isFinite(maxPriceMicro)) {
    throw badRequest('max_price must be a decimal string, e.g. "0.50"');
  }

  // The product id IS the offer id — it carries the chosen tier.
  return createOrder(apiUser, { offerId: productId, maxPriceMicro, idempotencyKey });
}
