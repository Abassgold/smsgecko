import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ORDER_SOURCES, ORDER_STATUSES } from '@smsgecko/shared';

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Which surface created it: the dashboard (session cookie) or the public API (Bearer key). */
    source: { type: String, enum: ORDER_SOURCES, default: 'web' },
    /** Short, human-friendly public reference (e.g. "SG-8FQ3-K2"), shown to
     *  customers and accepted on the API instead of the raw 24-hex _id. Unset
     *  on pre-existing orders — they fall back to _id. */
    publicId: { type: String, default: null },
    /** 10-digit numeric id for the SMS-Activate-compatible text API (clients there parse the id as an integer). Unset on older orders. */
    activationId: { type: String, default: null },
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

    /** Empty while `provisioning`: filled in once the provider hands the number over. */
    phoneNumber: { type: String, default: '' },
    priceMicro: { type: Number, required: true, min: 0 },

    status: { type: String, enum: ORDER_STATUSES, default: 'waiting', index: true },
    otpCode: { type: String, default: null },

    /** Adapter key (e.g. "hero_sms" | "tiger_sms") of the provider that fulfilled the rent. */
    provider: { type: String, default: 'unknown' },
    /** The ProviderConfig row that fulfilled it (null for legacy / dev rows). */
    providerConfigId: { type: Schema.Types.ObjectId, ref: 'ProviderConfig', default: null },
    providerLabel: { type: String, default: null },
    /** Null while `provisioning`: the number has not been rented yet. */
    providerRef: { type: String, default: null },
    /** Funds are held but the provider has not handed over a number yet. Hidden from the customer, never polled, and
     *  refunded by the reaper if it sticks (crash, timeout). Same hold-first sequence as manesms. */
    provisioning: { type: Boolean, default: false },
    /** Earlier codes on this activation. Non-empty after "another SMS" (setStatus 3); lets the poller tell the new
     *  SMS from the old one, and means a cancel or expiry while waiting for the second code never refunds. */
    otpHistory: { type: [String], default: [] },
    /** What the provider charged us, if known (margin reporting). */
    providerCostMicro: { type: Number, default: null },
    /** Last time the polling worker asked the provider for this order's status. */
    lastPolledAt: { type: Date, default: null },

    /** Per-user idempotency key for create; left unset (not null) when unused. */
    idempotencyKey: { type: String },
    /** sha256 of the normalized create-order params, so a replayed key with a
     *  different body can be rejected instead of silently returning this order. */
    idempotencyBodyHash: { type: String, default: null },

    /**
     * Earliest time a code is expected (null = unknown). Real adapters leave it
     * null and are polled on a fixed cadence; the test fixture stamps it.
     */
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
orderSchema.index({ providerRef: 1 }); // inbound SMS webhook lookup
orderSchema.index({ createdAt: 1 }, { partialFilterExpression: { provisioning: true } }); // the reaper
orderSchema.index(
  { publicId: 1 },
  { unique: true, partialFilterExpression: { publicId: { $type: 'string' } } },
);

orderSchema.index(
  { activationId: 1 },
  { unique: true, partialFilterExpression: { activationId: { $type: 'string' } } },
);

export type OrderAttrs = InferSchemaType<typeof orderSchema>;
export type OrderDoc = HydratedDocument<OrderAttrs>;
export const Order = model('Order', orderSchema);
