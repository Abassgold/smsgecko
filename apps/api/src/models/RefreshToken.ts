import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByJti: { type: String, default: null },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export type RefreshTokenAttrs = InferSchemaType<typeof refreshTokenSchema>;
export type RefreshTokenDoc = HydratedDocument<RefreshTokenAttrs>;

export const RefreshToken = model('RefreshToken', refreshTokenSchema);
