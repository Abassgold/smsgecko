import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const SUPPRESSION_REASONS = ['bounce', 'complaint'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/**
 * An address SES told us not to email again. Fed by the SNS bounce/complaint
 * webhook (controllers/sesNotifications.controller.ts) and checked by
 * lib/email.ts before every send.
 *
 * - `bounce`: a permanent (hard) bounce — the mailbox doesn't exist. Blocks all
 *   mail, since repeated hard bounces are what damage sender reputation.
 * - `complaint`: the recipient hit "mark as spam". Blocks broadcasts only;
 *   account mail the user asked for (password reset) still goes through.
 */
const emailSuppressionSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    reason: { type: String, enum: SUPPRESSION_REASONS, required: true },
    /** Bounce subtype / complaint feedback type, for debugging. */
    detail: { type: String, default: null },
    /** SES message id of the mail that triggered it. */
    messageId: { type: String, default: null },
  },
  { timestamps: true },
);

export type EmailSuppressionAttrs = InferSchemaType<typeof emailSuppressionSchema>;
export type EmailSuppressionDoc = HydratedDocument<EmailSuppressionAttrs>;

export const EmailSuppression = model('EmailSuppression', emailSuppressionSchema);
