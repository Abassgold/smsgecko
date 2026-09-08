import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { TRANSACTION_TYPES } from '@smsgecko/shared';

/**
 * Append-only wallet ledger. Written only by lib/ledger.ts, always paired with
 * the balance mutation it explains. `amountMicro` is signed (credits +, debits -)
 * and `balanceAfterMicro` is the user's balance immediately after this entry.
 */
const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    amountMicro: { type: Number, required: true },
    balanceAfterMicro: { type: Number, required: true },
    description: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    depositId: { type: Schema.Types.ObjectId, ref: 'Deposit', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });

export type TransactionAttrs = InferSchemaType<typeof transactionSchema>;
export type TransactionDoc = HydratedDocument<TransactionAttrs>;
export const Transaction = model('Transaction', transactionSchema);
