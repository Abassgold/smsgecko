import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const emailTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: ['verify_email', 'reset_password'], required: true },
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
