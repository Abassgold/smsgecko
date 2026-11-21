import type { Request, Response } from 'express';
import { MICRO_PER_USD } from '@smsgecko/shared';
import { ApiKey } from '../models/ApiKey.js';
import { Order, type OrderDoc } from '../models/Order.js';
import { SmsMessage } from '../models/SmsMessage.js';
import { User, type UserDoc } from '../models/User.js';
import { AppError } from '../lib/errors.js';
import { buildOfferId } from '../lib/catalog.js';
import { logger } from '../lib/logger.js';
import { priceTiers } from '../services/catalog.service.js';
import {
  cancelOrder,
  createOrder,
  finishOrder,
  retryOrder,
} from '../services/orders.service.js';
import {
  countriesList,
  findCountryCode,
  findServiceCode,
  pricesFor,
  servicesList,
} from '../services/activate.service.js';

/**
 * SMS-Activate-compatible text API (the protocol sms-activate.org and its clones document). One URL, `action` + `api_key`
 * in the query string or a form body; answers are plain tokens (JSON for the V2 / list methods), so existing SMS-Activate
 * software works by changing only the host. Served at /stubs/handler_api.php (what those tools append) and /api/handler_api.
 *
 *   getBalance · getNumber(V2) · getStatus(V2) · setStatus · getActiveActivations · getPrices(V2) · getServicesList · getCountries
 *
 * Codes are the catalog's own (service code, country id), exactly as /api/v2/catalog/products uses them.
 */

const MAX_PRICE = /^\d+(\.\d{1,6})?$/;

type Query = Record<string, string | undefined>;

export async function handlerApi(req: Request, res: Response): Promise<void> {
  const q: Query = { ...(req.query as Query), ...((req.body ?? {}) as Query) };
  const text = (s: string, status = 200) => void res.status(status).type('text/plain').send(s);
  const json = (v: unknown) => void res.json(v);

  const key = await ApiKey.verify(String(q.api_key ?? '').trim());
  const user = key ? await User.findById(key.userId) : null;
  if (!key || !user || user.status === 'suspended') return text('BAD_KEY', 401);
  key.lastUsedAt = new Date();
  void key.save();

  try {
    switch (q.action) {
      case 'getBalance':
        return text(`ACCESS_BALANCE:${(user.balanceMicro / MICRO_PER_USD).toFixed(4)}`);

      case 'getNumber':
      case 'getNumberV2':
        return await getNumber(user, q, text, json);

      case 'getStatus':
      case 'getStatusV2':
        return await getStatus(user, q, text, json);

      case 'setStatus':
        return await setStatus(user, q, text);

      case 'getActiveActivations':
        return await activeActivations(user, q, json);

      case 'getPrices':
      case 'getPricesV2': {
        // No service = every service, answered from the stored catalog (BAD_SERVICE if there is none to read yet).
        let service: string | null = null;
        if (q.service) {
          service = await findServiceCode(q.service);
          if (!service) return text('BAD_SERVICE');
        }
        let country: string | null = null;
        if (q.country) {
          country = await findCountryCode(q.country);
          if (!country) return text('BAD_COUNTRY');
        }
        const priced = await pricesFor(service, country, q.action === 'getPricesV2');
        if (!priced) return text('BAD_SERVICE');
        return json(priced);
      }

      case 'getServicesList':
        return json({ status: 'success', services: await servicesList() });

      case 'getCountries':
        return json(await countriesList());

      default:
        return text('BAD_ACTION');
    }
  } catch (err) {
    (req.log ?? logger).error({ err }, 'handler_api failed');
    return text('BAD_ACTION', 500);
  }
}

type Text = (s: string, status?: number) => void;
type Json = (v: unknown) => void;

async function getNumber(user: UserDoc, q: Query, text: Text, json: Json): Promise<void> {
  const service = await findServiceCode(q.service);
  if (!service) return text('BAD_SERVICE');
  const country = await findCountryCode(q.country);
  if (!country) return text('BAD_COUNTRY');

  // maxPrice (USD) is a ceiling: we sell the cheapest number at or under it. With fixedPrice=true it names an exact
  // price tier from getPricesV2 instead. A malformed value is refused, never cleaned up into a different number.
  let maxPriceMicro: number | undefined;
  if (q.maxPrice !== undefined && q.maxPrice !== '') {
    if (!MAX_PRICE.test(q.maxPrice)) return text('BAD_ACTION', 400);
    maxPriceMicro = Math.round(Number(q.maxPrice) * MICRO_PER_USD);
  }
  const fixed = String(q.fixedPrice).toLowerCase() === 'true' && maxPriceMicro !== undefined;

  // Live: this decides what is bought (the stored catalog is for browsing).
  const allTiers = await priceTiers(service, country, undefined, true);
  const tiers = allTiers.filter((t) => t.stock == null || t.stock > 0);
  if (!tiers.length) return text('NO_NUMBERS');
  let body: Parameters<typeof createOrder>[1];
  if (fixed) {
    const idx = allTiers.findIndex((t) => t.priceMicro === maxPriceMicro && (t.stock == null || t.stock > 0));
    if (idx < 0) return text('NO_NUMBERS');
    body = { offerId: buildOfferId(service, country, idx), maxPriceMicro };
  } else {
    if (maxPriceMicro !== undefined && tiers[0]!.priceMicro > maxPriceMicro) {
      return text(`WRONG_MAX_PRICE:${tiers[0]!.priceMicro / MICRO_PER_USD}`, 400);
    }
    body = { serviceId: service, countryId: country, maxPriceMicro };
  }

  let order: OrderDoc;
  try {
    ({ order } = await createOrder(user, body, 'api'));
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode === 402) return text('NO_BALANCE');
      // The price moved above the cap between our check and the purchase.
      if (err.code === 'UNPROCESSABLE') return text(`WRONG_MAX_PRICE:${tiers[0]!.priceMicro / MICRO_PER_USD}`, 400);
      // No stock, provider refusal, maintenance, no provider enabled…
      return text('NO_NUMBERS');
    }
    throw err;
  }

  const phone = order.phoneNumber.replace('+', '');
  if (q.action === 'getNumber') return text(`ACCESS_NUMBER:${idOf(order)}:${phone}`);
  return json({
    activationId: idOf(order),
    phoneNumber: phone,
    activationCost: order.priceMicro / MICRO_PER_USD,
    currency: 840,
    countryCode: order.countryId,
    canGetAnotherSms: true,
    activationTime: (order.get('createdAt') as Date).toISOString(),
    activationEndTime: order.expiresAt.toISOString(),
    activationOperator: null,
  });
}

/** The id the protocol hands out: numeric where the order has one, the public id for orders from before it existed. */
const idOf = (o: OrderDoc) => o.activationId ?? o.publicId ?? (o.id as string);

async function findOrder(user: UserDoc, id: string | undefined): Promise<OrderDoc | null> {
  const v = String(id ?? '').trim();
  if (!v) return null;
  const by = /^[a-f\d]{24}$/i.test(v) ? { _id: v } : /^\d{10}$/.test(v) ? { activationId: v } : { publicId: v };
  return Order.findOne({ ...by, userId: user._id, provisioning: { $ne: true } });
}

async function codeOf(order: OrderDoc): Promise<string> {
  if (order.otpCode) return order.otpCode;
  const last = await SmsMessage.findOne({ orderId: order._id }).sort({ receivedAt: -1 });
  return last?.text ?? '';
}

async function getStatus(user: UserDoc, q: Query, text: Text, json: Json): Promise<void> {
  const order = await findOrder(user, q.id);
  if (!order) return text('NO_ACTIVATION');
  if (order.status === 'canceled' || order.status === 'expired') return text('STATUS_CANCEL');

  if (q.action === 'getStatusV2') {
    const done = order.status === 'completed';
    const body = done ? await codeOf(order) : '';
    const sms = done
      ? { dateTime: (order.completedAt ?? new Date()).toISOString(), code: order.otpCode ?? body, text: body }
      : null;
    return json({ verificationType: 0, sms, call: null });
  }
  if (order.status === 'completed') return text(`STATUS_OK:${await codeOf(order)}`);
  // After "another SMS" the previous code keeps showing until the new one arrives.
  const prev = order.otpHistory[order.otpHistory.length - 1];
  return text(prev ? `STATUS_WAIT_RETRY:${prev}` : 'STATUS_WAIT_CODE');
}

async function setStatus(user: UserDoc, q: Query, text: Text): Promise<void> {
  const order = await findOrder(user, q.id);
  if (!order) return text('NO_ACTIVATION');
  const status = String(q.status);

  if (status === '8' || status === '-1') {
    // Waiting for *another* SMS: a code was already delivered and paid for, so there is nothing to cancel or refund.
    // The order just stops waiting. Say so instead of claiming a cancellation.
    const waitingForAnother = order.status === 'waiting' && order.otpHistory.length > 0;
    try {
      await cancelOrder(user, order.id as string);
      if (waitingForAnother) return text(`STATUS_OK:${order.otpHistory[order.otpHistory.length - 1]}`);
      return text('ACCESS_CANCEL');
    } catch (err) {
      if (err instanceof AppError && err.code === 'CANCEL_TOO_EARLY') return text('EARLY_CANCEL_DENIED');
      // The provider could not be asked: nothing was refunded, the activation is untouched. Safe to retry.
      if (err instanceof AppError && err.code === 'PROVIDER_UNAVAILABLE') return text('BAD_ACTION', 503);
      // Lost a race, or the code already arrived: report what the order now is.
      const again = await findOrder(user, q.id);
      if (again?.status === 'completed') return text(`STATUS_OK:${await codeOf(again)}`);
      if (again?.status === 'canceled' || again?.status === 'expired') return text('ACCESS_CANCEL');
      throw err;
    }
  }

  if (status === '3') {
    // "Another SMS": only after a code has arrived and before the number expires (otherwise BAD_STATUS).
    try {
      await retryOrder(user, order.id as string);
      return text('ACCESS_RETRY_GET');
    } catch (err) {
      if (err instanceof AppError) return text('BAD_STATUS');
      throw err;
    }
  }

  if (status === '6') {
    // Finishing only makes sense once the code arrived.
    if (order.status !== 'completed') return text('BAD_STATUS');
    await finishOrder(user, order.id as string);
    return text('ACCESS_ACTIVATION');
  }

  if (status === '1') return text('ACCESS_READY');
  return text('BAD_STATUS');
}

async function activeActivations(user: UserDoc, q: Query, json: Json): Promise<void> {
  const start = Math.max(0, Number(q.start) || 0);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
  const since = new Date(Date.now() - 30 * 60_000);
  const rows = await Order.find({
    userId: user._id,
    provisioning: { $ne: true },
    $or: [{ status: 'waiting' }, { status: 'completed', completedAt: { $gte: since } }],
  })
    .sort({ createdAt: -1 })
    .skip(start)
    .limit(limit);
  return json({
    status: 'success',
    data: rows.map((o) => ({
      activationId: idOf(o),
      serviceCode: o.serviceId,
      phoneNumber: o.phoneNumber.replace('+', ''),
      activationCost: o.priceMicro / MICRO_PER_USD,
      // 1 = waiting for the first SMS, 3 = waiting for another one, 6 = done
      activationStatus: o.status === 'completed' ? '6' : o.otpHistory.length ? '3' : '1',
      smsCode: o.otpCode,
      smsText: o.otpCode,
      activationTime: (o.get('createdAt') as Date).toISOString(),
      countryCode: o.countryId,
      countryName: o.countryName,
      canGetAnotherSms: o.status === 'completed' && o.expiresAt.getTime() > Date.now(),
      currency: 840,
    })),
  });
}
