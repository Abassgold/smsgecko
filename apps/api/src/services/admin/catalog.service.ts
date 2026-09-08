import type { AdminCountryRow, AdminOfferRow, AdminServiceRow } from '@smsgecko/shared';
import { Service, type ServiceDoc } from '../../models/Service.js';
import { Country, type CountryDoc } from '../../models/Country.js';
import { Offer } from '../../models/Offer.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import type {
  AdminOffersQuery,
  BulkOfferBody,
} from '../../lib/validation/admin/catalog.schema.js';

/* ---- rows ---- */

function serviceRow(s: ServiceDoc): Omit<AdminServiceRow, 'offerCount'> {
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

function countryRow(c: CountryDoc): Omit<AdminCountryRow, 'offerCount'> {
  return {
    id: c.id as string,
    code: c.code,
    name: c.name,
    dialCode: c.dialCode,
    flagEmoji: c.flagEmoji,
    sortOrder: c.sortOrder,
  };
}

/* ---- services ---- */

export interface ServiceInput {
  slug?: string;
  name?: string;
  iconKey?: string;
  aliases?: string[];
  popular?: boolean;
  sortOrder?: number;
}

export async function listServices(): Promise<AdminServiceRow[]> {
  const services = await Service.find().sort({ sortOrder: 1, name: 1 });
  const counts = await Offer.aggregate<{ _id: unknown; n: number }>([
    { $group: { _id: '$serviceId', n: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  return services.map((s) => ({ ...serviceRow(s), offerCount: map.get(String(s._id)) ?? 0 }));
}

export async function createService(body: ServiceInput): Promise<AdminServiceRow> {
  if (await Service.exists({ slug: body.slug })) throw conflict('That slug is taken');
  const [s] = await Service.create([body]);
  return { ...serviceRow(s!), offerCount: 0 };
}

export async function updateService(id: string, body: ServiceInput): Promise<AdminServiceRow> {
  const s = await Service.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });
  if (!s) throw notFound('Service not found');
  return { ...serviceRow(s), offerCount: await Offer.countDocuments({ serviceId: s._id }) };
}

export async function deleteService(id: string): Promise<void> {
  await Offer.deleteMany({ serviceId: id });
  const result = await Service.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw notFound('Service not found');
}

/* ---- countries ---- */

export interface CountryInput {
  code?: string;
  name?: string;
  dialCode?: string;
  flagEmoji?: string;
  sortOrder?: number;
}

export async function listCountries(): Promise<AdminCountryRow[]> {
  const countries = await Country.find().sort({ sortOrder: 1, name: 1 });
  const counts = await Offer.aggregate<{ _id: unknown; n: number }>([
    { $group: { _id: '$countryId', n: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  return countries.map((c) => ({ ...countryRow(c), offerCount: map.get(String(c._id)) ?? 0 }));
}

export async function createCountry(body: CountryInput): Promise<AdminCountryRow> {
  if (await Country.exists({ code: body.code })) throw conflict('That country code exists');
  const [c] = await Country.create([body]);
  return { ...countryRow(c!), offerCount: 0 };
}

export async function updateCountry(id: string, body: CountryInput): Promise<AdminCountryRow> {
  const c = await Country.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });
  if (!c) throw notFound('Country not found');
  return { ...countryRow(c), offerCount: await Offer.countDocuments({ countryId: c._id }) };
}

export async function deleteCountry(id: string): Promise<void> {
  await Offer.deleteMany({ countryId: id });
  const result = await Country.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw notFound('Country not found');
}

/* ---- offers ---- */

export interface OfferInput {
  serviceId?: string;
  countryId?: string;
  operator?: string | null;
  priceMicro?: number;
  stock?: number;
  active?: boolean;
}

export async function listOffers(query: AdminOffersQuery) {
  const { serviceId, countryId, page, limit } = query;
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
  const items: AdminOfferRow[] = offers.map((o) => ({
    id: o.id as string,
    serviceId: String(o.serviceId),
    serviceName: sMap.get(String(o.serviceId)) ?? '—',
    countryId: String(o.countryId),
    countryName: cMap.get(String(o.countryId)) ?? '—',
    operator: o.operator ?? null,
    priceMicro: o.priceMicro,
    stock: o.stock,
    active: o.active,
  }));
  return { items, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function createOffer(body: OfferInput): Promise<void> {
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
}

export async function updateOffer(id: string, body: OfferInput): Promise<void> {
  const result = await Offer.updateOne({ _id: id }, { $set: body });
  if (result.matchedCount === 0) throw notFound('Offer not found');
}

export async function deleteOffer(id: string): Promise<void> {
  const result = await Offer.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw notFound('Offer not found');
}

export async function bulkOffers(body: BulkOfferBody): Promise<{ matched: number; modified: number }> {
  const { serviceId, countryId, setPriceMicro, adjustPricePct, setStock, active } = body;
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

  return { matched, modified };
}
