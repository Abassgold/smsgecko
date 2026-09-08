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
    mockSmsSuccessRate: { type: Number, required: true, min: 0, max: 1 },
    mockSmsMinDelayMs: { type: Number, required: true, min: 0 },
    mockSmsMaxDelayMs: { type: Number, required: true, min: 0 },
    affiliateRatePct: { type: Number, required: true, min: 0, max: 100 },
    minDepositMicro: { type: Number, required: true, min: 0 },
    numberMarkupPercent: { type: Number, default: 0, min: 0 },
    numberMarkupFlatMicro: { type: Number, default: 0, min: 0 },
    signupsEnabled: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);

export type SettingAttrs = InferSchemaType<typeof settingSchema>;
export type SettingDoc = HydratedDocument<SettingAttrs>;
export const Setting = model('Setting', settingSchema);
