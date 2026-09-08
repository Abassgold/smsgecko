import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    isVerified: { type: Boolean, default: false },

    /** Wallet balance in integer micro-USD. Only lib/ledger.ts mutates this. */
    balanceMicro: { type: Number, default: 0, min: 0 },

    affiliateCode: { type: String, required: true, unique: true },
    /** Version string of the affiliate terms the user has accepted, or null. */
    affiliateTermsVersion: { type: String, default: null },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;

export const User = model('User', userSchema);

/** Shape returned to clients (matches @smsgecko/shared `publicUser`). */
export function toPublicUser(user: UserDoc) {
  return {
    id: user.id as string,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    isVerified: user.isVerified,
    balanceMicro: user.balanceMicro,
    affiliateCode: user.affiliateCode,
    affiliateTermsVersion: user.affiliateTermsVersion ?? null,
    createdAt: (user.get('createdAt') as Date).toISOString(),
  };
}
