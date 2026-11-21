import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** One price option of an offer, as the provider reports it (RAW price: the customer markup is applied when read). */
const tierSchema = new Schema(
  {
    priceMicro: { type: Number, required: true, min: 0 },
    /** Numbers available at this price (null = the provider does not say). */
    stock: { type: Number, default: null },
    /** Upstream operator id, when the provider splits tiers by operator. */
    operator: { type: String, default: null },
  },
  { _id: false },
);

/**
 * A stored copy of what the catalog provider sells for one service × country, refreshed by the catalog sync (the
 * manesms `Offer`). Browsing, `getPrices` and the price pages read this instead of calling the provider; checkout
 * still asks the provider live, so a stale copy can never sell at the wrong price.
 */
const catalogOfferSchema = new Schema(
  {
    /** The provider (ProviderConfig) whose catalog this is: switching the catalog provider switches the data. */
    providerConfigId: { type: Schema.Types.ObjectId, ref: 'ProviderConfig', required: true },
    /** The provider's own codes, exactly as the live catalog uses them. */
    serviceCode: { type: String, required: true },
    countryCode: { type: String, required: true },
    /** Cheapest first. Empty = nothing on sale (sold out). */
    tiers: { type: [tierSchema], default: [] },
    /** Switched off by an admin: the sync keeps refreshing its prices but never turns it back on. */
    adminDisabled: { type: Boolean, default: false },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

catalogOfferSchema.index({ providerConfigId: 1, serviceCode: 1, countryCode: 1 }, { unique: true });
catalogOfferSchema.index({ providerConfigId: 1, countryCode: 1 });

export type CatalogOfferAttrs = InferSchemaType<typeof catalogOfferSchema>;
export type CatalogOfferDoc = HydratedDocument<CatalogOfferAttrs>;
export const CatalogOffer = model('CatalogOffer', catalogOfferSchema);
