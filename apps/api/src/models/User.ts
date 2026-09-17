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

    /** Order-event webhook (single endpoint per account). Secret is stored in the
     *  clear — unlike an API key it authenticates *us to them*, not the reverse,
     *  and GET /webhook must be able to show it back. */
    webhookUrl: { type: String, default: null },
    webhookSecret: { type: String, default: null },

    /** TOTP two-factor auth. Secrets are AES-256-GCM encrypted (lib/secretbox) —
     *  unlike the webhook secret, we only ever need to check these, never show
     *  them back. */
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecretEnc: { type: String, default: null },
    /** Set while setup is in progress but not yet confirmed with a code. */
    twoFactorPendingSecretEnc: { type: String, default: null },
    /** sha256 of each unused recovery code; consumed (spliced out) on use. */
    twoFactorRecoveryHashes: { type: [String], default: [] },

    /** Opted out of admin broadcast emails via the one-click unsubscribe
     * link. Transactional email (verification, password reset, etc.) is
     * unaffected — this only gates the broadcast worker's audience query. */
    unsubscribedFromBroadcasts: { type: Boolean, default: false },
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
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: (user.get('createdAt') as Date).toISOString(),
  };
}
