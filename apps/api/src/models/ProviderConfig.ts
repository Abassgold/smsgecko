import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const PROVIDER_ADAPTER_KEYS = [
  'mock',
  'custom_http',
  'hero_sms',
  'daisy_sms',
  'sms_bower',
  'sms_code',
  'sms_pool',
  'hstockplus',
] as const;
export type ProviderAdapterKey = (typeof PROVIDER_ADAPTER_KEYS)[number];

const statsSchema = new Schema(
  {
    rentAttempts: { type: Number, default: 0 },
    rentSuccess: { type: Number, default: 0 },
    rentNoStock: { type: Number, default: 0 },
    rentError: { type: Number, default: 0 },
    otpReceived: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    lastErrorAt: { type: Date, default: null },
  },
  { _id: false },
);

const providerConfigSchema = new Schema(
  {
    key: { type: String, enum: PROVIDER_ADAPTER_KEYS, required: true },
    label: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, default: false },
    priority: { type: Number, default: 100 },
    configEnc: { type: String, default: null },
    stats: { type: statsSchema, default: () => ({}) },
    healthOk: { type: Boolean, default: null },
    healthDetail: { type: String, default: null },
    healthCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

providerConfigSchema.index({ enabled: 1, priority: 1 });

export type ProviderConfigAttrs = InferSchemaType<typeof providerConfigSchema>;
export type ProviderConfigDoc = HydratedDocument<ProviderConfigAttrs>;
export const ProviderConfig = model('ProviderConfig', providerConfigSchema);
