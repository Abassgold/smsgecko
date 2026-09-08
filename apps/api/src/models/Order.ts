import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ORDER_STATUSES } from '@smsgecko/shared';

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** The active provider's own service / country codes at order time. */
    serviceId: { type: String, required: true },
    countryId: { type: String, required: true },

    /** Denormalised for cheap listing / history. */
    serviceSlug: { type: String, required: true },
    serviceName: { type: String, required: true },
    serviceIconKey: { type: String, default: '' },
    countryName: { type: String, required: true },
    countryCode: { type: String, required: true },
    countryFlagEmoji: { type: String, required: true },

    phoneNumber: { type: String, required: true },
    priceMicro: { type: Number, required: true, min: 0 },

    status: { type: String, enum: ORDER_STATUSES, default: 'waiting', index: true },
    otpCode: { type: String, default: null },

    /** Adapter key ("mock" | "custom_http") of the provider that fulfilled the rent. */
    provider: { type: String, default: 'mock' },
    /** The ProviderConfig row that fulfilled it (null for legacy / dev rows). */
    providerConfigId: { type: Schema.Types.ObjectId, ref: 'ProviderConfig', default: null },
    providerLabel: { type: String, default: null },
    providerRef: { type: String, required: true },
    /** What the provider charged us, if known (margin reporting). */
    providerCostMicro: { type: Number, default: null },
    /** Last time the polling worker asked the provider for this order's status. */
    lastPolledAt: { type: Date, default: null },

    /** Per-user idempotency key for create; left unset (not null) when unused. */
    idempotencyKey: { type: String },

    /** When the mock provider should deliver an SMS (null = never — will expire). */
    deliverAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true },
    completedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    /** Set when a v2 client calls /finish on a completed order. */
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

orderSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, deliverAt: 1 });
orderSchema.index({ status: 1, lastPolledAt: 1 });
orderSchema.index({ status: 1, expiresAt: 1 });
orderSchema.index({ providerConfigId: 1 });

export type OrderAttrs = InferSchemaType<typeof orderSchema>;
export type OrderDoc = HydratedDocument<OrderAttrs>;
export const Order = model('Order', orderSchema);
