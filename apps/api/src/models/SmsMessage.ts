import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** One received SMS for an order. An order may receive more than one. */
const smsMessageSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sender: { type: String, required: true },
    text: { type: String, required: true },
    parsedOtp: { type: String, default: null },
    receivedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

export type SmsMessageAttrs = InferSchemaType<typeof smsMessageSchema>;
export type SmsMessageDoc = HydratedDocument<SmsMessageAttrs>;
export const SmsMessage = model('SmsMessage', smsMessageSchema);
