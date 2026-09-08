import { Router } from 'express';
import { z } from 'zod';
import {
  adminOffersQuery,
  bulkOfferBody,
  createCountryBody,
  createOfferBody,
  createServiceBody,
  objectId,
  updateCountryBody,
  updateOfferBody,
  updateServiceBody,
} from '@smsgecko/shared';
import { Service, type ServiceDoc } from '../../models/Service.js';
import { Country, type CountryDoc } from '../../models/Country.js';
import { Offer } from '../../models/Offer.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';

const idParams = z.object({ id: objectId });

export const adminCatalogRouter = Router();

/* ---- services ---- */
adminCatalogRouter.get('/services', async (_req, res) => {
  const services = await Service.find().sort({ sortOrder: 1, name: 1 });
  const counts = await Offer.aggregate<{ _id: unknown; n: number }>([
    { $group: { _id: '$serviceId', n: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(
    services.map((s) => ({
      id: s.id as string,
      slug: s.slug,
      name: s.name,
      iconKey: s.iconKey,
      aliases: s.aliases ?? [],
      popular: s.popular,
      sortOrder: s.sortOrder,
      offerCount: map.get(String(s._id)) ?? 0,
    })),
  );
});

adminCatalogRouter.post('/services', async (req, res) => {
  const body = parse(createServiceBody, req.body);
  if (await Service.exists({ slug: body.slug })) throw conflict('That slug is taken');
  const [s] = await Service.create([body]);
  res.status(201).json({ ...serviceRow(s!), offerCount: 0 });
});

adminCatalogRouter.patch('/services/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateServiceBody, req.body);
  const s = await Service.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });
  if (!s) throw notFound('Service not found');
  res.json({ ...serviceRow(s), offerCount: await Offer.countDocuments({ serviceId: s._id }) });
});

adminCatalogRouter.delete('/services/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  await Offer.deleteMany({ serviceId: id });
  const result = await Service.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw notFound('Service not found');
  res.json({ ok: true as const });
});

/* ---- countries ---- */
adminCatalogRouter.get('/countries', async (_req, res) => {
  const countries = await Country.find().sort({ sortOrder: 1, name: 1 });
  const counts = await Offer.aggregate<{ _id: unknown; n: number }>([
    { $group: { _id: '$countryId', n: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(
    countries.map((c) => ({
      id: c.id as string,
      code: c.code,
      name: c.name,
      dialCode: c.dialCode,
      flagEmoji: c.flagEmoji,
      sortOrder: c.sortOrder,
      offerCount: map.get(String(c._id)) ?? 0,
    })),
  );
});

adminCatalogRouter.post('/countries', async (req, res) => {
  const body = parse(createCountryBody, req.body);
  if (await Country.exists({ code: body.code })) throw conflict('That country code exists');
  const [c] = await Country.create([body]);
  res.status(201).json({ ...countryRow(c!), offerCount: 0 });
});

adminCatalogRouter.patch('/countries/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateCountryBody, req.body);
  const c = await Country.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });
  if (!c) throw notFound('Country not found');
  res.json({ ...countryRow(c), offerCount: await Offer.countDocuments({ countryId: c._id }) });
});

adminCatalogRouter.delete('/countries/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  await Offer.deleteMany({ countryId: id });
  const result = await Country.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw notFound('Country not found');
  res.json({ ok: true as const });
});

/* ---- offers ---- */
adminCatalogRouter.get('/offers', async (req, res) => {
  const { serviceId, countryId, page, limit } = parse(adminOffersQuery, req.query);
  const filter: Record<string, unknown> = {};
  if (serviceId) filter.serviceId = serviceId;
  if (countryId) filter.countryId = countryId;
  const [offers, total] = await Promise.all([
    Offer.find(filter)
      .sort({ priceMicro: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Offer.countDocuments(filter),
  ]);
  const [services, countries] = await Promise.all([
    Service.find({ _id: { $in: offers.map((o) => o.serviceId) } }, { name: 1 }),
    Country.find({ _id: { $in: offers.map((o) => o.countryId) } }, { name: 1 }),
  ]);
  const sMap = new Map(services.map((s) => [String(s._id), s.name]));
  const cMap = new Map(countries.map((c) => [String(c._id), c.name]));
  res.json({
    items: offers.map((o) => ({
      id: o.id as string,
      serviceId: String(o.serviceId),
      serviceName: sMap.get(String(o.serviceId)) ?? '—',
      countryId: String(o.countryId),
      countryName: cMap.get(String(o.countryId)) ?? '—',
      operator: o.operator ?? null,
      priceMicro: o.priceMicro,
      stock: o.stock,
      active: o.active,
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

adminCatalogRouter.post('/offers', async (req, res) => {
  const body = parse(createOfferBody, req.body);
  const [svc, ctry] = await Promise.all([
    Service.exists({ _id: body.serviceId }),
    Country.exists({ _id: body.countryId }),
  ]);
  if (!svc || !ctry) throw badRequest('Unknown service or country');
  if (
    await Offer.exists({
      serviceId: body.serviceId,
      countryId: body.countryId,
      operator: body.operator,
    })
  ) {
    throw conflict('An offer for that service/country/operator already exists');
  }
  await Offer.create(body);
  res.status(201).json({ ok: true as const });
});

adminCatalogRouter.patch('/offers/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(updateOfferBody, req.body);
  const result = await Offer.updateOne({ _id: id }, { $set: body });
  if (result.matchedCount === 0) throw notFound('Offer not found');
  res.json({ ok: true as const });
});

adminCatalogRouter.delete('/offers/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const result = await Offer.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw notFound('Offer not found');
  res.json({ ok: true as const });
});

adminCatalogRouter.post('/offers/bulk', async (req, res) => {
  const { serviceId, countryId, setPriceMicro, adjustPricePct, setStock, active } = parse(
    bulkOfferBody,
    req.body,
  );
  const filter: Record<string, unknown> = {};
  if (serviceId) filter.serviceId = serviceId;
  if (countryId) filter.countryId = countryId;

  const set: Record<string, unknown> = {};
  if (setPriceMicro !== undefined) set.priceMicro = setPriceMicro;
  if (setStock !== undefined) set.stock = setStock;
  if (active !== undefined) set.active = active;

  let matched = 0;
  let modified = 0;

  if (adjustPricePct !== undefined) {
    const factor = 1 + adjustPricePct / 100;
    const offers = await Offer.find(filter, { priceMicro: 1 });
    matched = offers.length;
    const ops = offers.map((o) => ({
      updateOne: {
        filter: { _id: o._id },
        update: { $set: { priceMicro: Math.max(0, Math.round(o.priceMicro * factor)) } },
      },
    }));
    if (ops.length) {
      const result = await Offer.bulkWrite(ops);
      modified = result.modifiedCount ?? 0;
    }
  }

  if (Object.keys(set).length) {
    const result = await Offer.updateMany(filter, { $set: set });
    matched = Math.max(matched, result.matchedCount);
    modified = Math.max(modified, result.modifiedCount);
  }

  res.json({ matched, modified });
});

function serviceRow(s: ServiceDoc) {
  return {
    id: s.id as string,
    slug: s.slug,
    name: s.name,
    iconKey: s.iconKey,
    aliases: s.aliases ?? [],
    popular: s.popular,
    sortOrder: s.sortOrder,
  };
}
function countryRow(c: CountryDoc) {
  return {
    id: c.id as string,
    code: c.code,
    name: c.name,
    dialCode: c.dialCode,
    flagEmoji: c.flagEmoji,
    sortOrder: c.sortOrder,
  };
}
