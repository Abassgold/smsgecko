import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A buyable service×country(×operator) slot with a price and live stock — the
 * "catalog_product" of the public API. Stock is decremented on order create and
 * restored on expiry/cancel.
 */
const offerSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    countryId: { type: Schema.Types.ObjectId, ref: 'Country', required: true },
    /** Carrier/operator, or null for "any". */
    operator: { type: String, default: null },
    priceMicro: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

offerSchema.index({ serviceId: 1, countryId: 1, operator: 1 }, { unique: true });
offerSchema.index({ serviceId: 1, countryId: 1, active: 1, priceMicro: 1 });

export type OfferAttrs = InferSchemaType<typeof offerSchema>;
export type OfferDoc = HydratedDocument<OfferAttrs>;
export const Offer = model('Offer', offerSchema);
