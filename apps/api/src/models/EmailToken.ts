import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One row per issued email link (currently just address verification). The raw
 * token travels in the email; we persist only its sha256 so a DB leak can't be
 * used to verify accounts. Rows self-delete a day after they expire.
 */
const emailTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: ['verify_email'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export type EmailTokenAttrs = InferSchemaType<typeof emailTokenSchema>;
export type EmailTokenDoc = HydratedDocument<EmailTokenAttrs>;

export const EmailToken = model('EmailToken', emailTokenSchema);
