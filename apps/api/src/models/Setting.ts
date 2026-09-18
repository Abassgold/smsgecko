import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const settingSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    orderTtlSeconds: { type: Number, required: true },
    providerPollIntervalMs: { type: Number, required: true },
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
