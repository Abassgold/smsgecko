import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One row per issued refresh token. The JWT itself is the bearer credential;
 * we persist its `jti` + a hash so tokens can be revoked and rotation reuse
 * (a sign of theft) can be detected.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    /** Rotation family — all descendants of one login share it. */
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByJti: { type: String, default: null },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true },
);

// TTL cleanup once a token is well past expiry.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export type RefreshTokenAttrs = InferSchemaType<typeof refreshTokenSchema>;
export type RefreshTokenDoc = HydratedDocument<RefreshTokenAttrs>;

export const RefreshToken = model('RefreshToken', refreshTokenSchema);
