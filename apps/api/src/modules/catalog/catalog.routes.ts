import { Router } from 'express';
import { catalogSearchQuery, offersQuery, quoteQuery } from '@smsgecko/shared';
import { Service, type ServiceDoc } from '../../models/Service.js';
import { Country, type CountryDoc } from '../../models/Country.js';
import { Offer, type OfferDoc } from '../../models/Offer.js';
import { notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toServiceView(s: ServiceDoc) {
  return { id: s.id as string, slug: s.slug, name: s.name, iconKey: s.iconKey, popular: s.popular };
}
function toCountryView(c: CountryDoc) {
  return {
    id: c.id as string,
    code: c.code,
    name: c.name,
    dialCode: c.dialCode,
    flagEmoji: c.flagEmoji,
  };
}
function toOfferView(o: OfferDoc) {
  return {
    id: o.id as string,
    serviceId: String(o.serviceId),
    countryId: String(o.countryId),
    operator: o.operator ?? null,
    priceMicro: o.priceMicro,
    stock: o.stock,
  };
}

export const catalogRouter = Router();

catalogRouter.get('/services', async (req, res) => {
  const { q, limit } = parse(catalogSearchQuery, req.query);
  const filter = q
    ? {
        $or: [
          { name: new RegExp(escapeRegex(q), 'i') },
          { aliases: new RegExp(escapeRegex(q), 'i') },
          { slug: new RegExp(escapeRegex(q), 'i') },
        ],
      }
    : {};
  const services = await Service.find(filter).sort({ popular: -1, sortOrder: 1, name: 1 }).limit(limit);
  res.json(services.map(toServiceView));
});

catalogRouter.get('/countries', async (req, res) => {
  const { q, limit } = parse(catalogSearchQuery, req.query);
  const filter = q
    ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { code: new RegExp(escapeRegex(q), 'i') }] }
    : {};
  const countries = await Country.find(filter).sort({ sortOrder: 1, name: 1 }).limit(limit);
  res.json(countries.map(toCountryView));
});

catalogRouter.get('/offers', async (req, res) => {
  const { serviceId, countryId } = parse(offersQuery, req.query);
  const offers = await Offer.find({ serviceId, countryId, active: true }).sort({ priceMicro: 1 });
  res.json(offers.map(toOfferView));
});

catalogRouter.get('/quote', async (req, res) => {
  const { serviceId, countryId } = parse(quoteQuery, req.query);
  const [service, country] = await Promise.all([
    Service.exists({ _id: serviceId }),
    Country.exists({ _id: countryId }),
  ]);
  if (!service) throw notFound('Service not found');
  if (!country) throw notFound('Country not found');

  const best = await Offer.findOne({
    serviceId,
    countryId,
    active: true,
    stock: { $gt: 0 },
  }).sort({ priceMicro: 1 });

  res.json({
    serviceId,
    countryId,
    available: Boolean(best),
    bestOffer: best ? toOfferView(best) : null,
  });
});
