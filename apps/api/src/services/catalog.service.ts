import type { CountryView, OfferView, QuoteResponse, ServiceView } from '@smsgecko/shared';
import { Service, type ServiceDoc } from '../models/Service.js';
import { Country, type CountryDoc } from '../models/Country.js';
import { Offer, type OfferDoc } from '../models/Offer.js';
import { notFound } from '../lib/errors.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toServiceView(s: ServiceDoc): ServiceView {
  return { id: s.id as string, slug: s.slug, name: s.name, iconKey: s.iconKey, popular: s.popular };
}

export function toCountryView(c: CountryDoc): CountryView {
  return {
    id: c.id as string,
    code: c.code,
    name: c.name,
    dialCode: c.dialCode,
    flagEmoji: c.flagEmoji,
  };
}

export function toOfferView(o: OfferDoc): OfferView {
  return {
    id: o.id as string,
    serviceId: String(o.serviceId),
    countryId: String(o.countryId),
    operator: o.operator ?? null,
    priceMicro: o.priceMicro,
    stock: o.stock,
  };
}

export async function searchServices(q: string | undefined, limit: number): Promise<ServiceView[]> {
  const filter = q
    ? {
        $or: [
          { name: new RegExp(escapeRegex(q), 'i') },
          { aliases: new RegExp(escapeRegex(q), 'i') },
          { slug: new RegExp(escapeRegex(q), 'i') },
        ],
      }
    : {};
  const services = await Service.find(filter)
    .sort({ popular: -1, sortOrder: 1, name: 1 })
    .limit(limit);
  return services.map(toServiceView);
}

export async function searchCountries(q: string | undefined, limit: number): Promise<CountryView[]> {
  const filter = q
    ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { code: new RegExp(escapeRegex(q), 'i') }] }
    : {};
  const countries = await Country.find(filter).sort({ sortOrder: 1, name: 1 }).limit(limit);
  return countries.map(toCountryView);
}

export async function listOffers(serviceId: string, countryId: string): Promise<OfferView[]> {
  const offers = await Offer.find({ serviceId, countryId, active: true }).sort({ priceMicro: 1 });
  return offers.map(toOfferView);
}

export async function getQuote(serviceId: string, countryId: string): Promise<QuoteResponse> {
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

  return {
    serviceId,
    countryId,
    available: Boolean(best),
    bestOffer: best ? toOfferView(best) : null,
  };
}
