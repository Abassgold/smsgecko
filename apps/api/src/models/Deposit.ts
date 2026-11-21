import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { DEPOSIT_METHODS, DEPOSIT_STATUSES } from '@smsgecko/shared';

const depositSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    method: { type: String, enum: DEPOSIT_METHODS, required: true },
    amountMicro: { type: Number, required: true, min: 0 },
    status: { type: String, enum: DEPOSIT_STATUSES, default: 'pending', index: true },
    provider: { type: String, required: true },
    providerRef: { type: String, required: true, unique: true },
    payAddress: { type: String, default: null },
    payUrl: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    confirmedAt: { type: Date, default: null },
    /** Last invoice status the gateway reported (Trybit: created, paid, overpaid, partial, canceled). */
    providerStatus: { type: String, default: null },
    /** What was actually credited, in micro-USD, when it differs from the invoice (a short or over payment). */
    paidMicro: { type: Number, default: null },
    /** What the gateway says arrived (received_usd, after its fees), in micro-USD. Audit only: `paidMicro` is what was credited. */
    receivedMicro: { type: Number, default: null },
    /** First blockchain transaction id of the payment, for support. */
    txId: { type: String, default: null },
  },
  { timestamps: true },
);

export type DepositAttrs = InferSchemaType<typeof depositSchema>;
export type DepositDoc = HydratedDocument<DepositAttrs>;
export const Deposit = model('Deposit', depositSchema);
