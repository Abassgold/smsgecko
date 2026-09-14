import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Runtime configuration, editable from the admin panel. A single document with
 * `_id: 'global'`. Seeded from env defaults on first boot; env stays the
 * fallback if Mongo is unreachable.
 */
const settingSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    orderTtlSeconds: { type: Number, required: true },
    providerPollIntervalMs: { type: Number, required: true },
    affiliateRatePct: { type: Number, required: true, min: 0, max: 100 },
    minDepositMicro: { type: Number, required: true, min: 0 },
    numberMarkupPercent: { type: Number, default: 0, min: 0 },
    numberMarkupFlatMicro: { type: Number, default: 0, min: 0 },
    /** USD→local-currency rates for Korapay's African corridors. No live feed — admin sets them by hand. */
    korapayFxRates: {
      type: {
        NGN: { type: Number, default: 1600, min: 1 },
        GHS: { type: Number, default: 12, min: 1 },
        KES: { type: Number, default: 129, min: 1 },
        ZAR: { type: Number, default: 16, min: 1 },
      },
      default: () => ({ NGN: 1600, GHS: 12, KES: 129, ZAR: 16 }),
      _id: false,
    },
    signupsEnabled: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);

export type SettingAttrs = InferSchemaType<typeof settingSchema>;
export type SettingDoc = HydratedDocument<SettingAttrs>;
export const Setting = model('Setting', settingSchema);
