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
    /** Payment instructions surfaced to the user (crypto address / hosted URL). */
    payAddress: { type: String, default: null },
    payUrl: { type: String, default: null },

    expiresAt: { type: Date, required: true },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type DepositAttrs = InferSchemaType<typeof depositSchema>;
export type DepositDoc = HydratedDocument<DepositAttrs>;
export const Deposit = model('Deposit', depositSchema);
