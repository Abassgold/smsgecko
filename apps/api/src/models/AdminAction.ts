import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Audit trail for admin-panel mutations — who did what, to what, and why.
 * Append-only; nothing here is ever edited or deleted by the app.
 */
const adminActionSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** e.g. "user_update", "balance_adjust", "order_cancel", "settings_update", "deposit_confirm". */
    action: { type: String, required: true },
    /** What kind of thing was acted on, e.g. "user" | "order" | "deposit" | "settings". */
    targetType: { type: String, required: true },
    /** The target's id, when it has one (settings is a singleton, so null there). */
    targetId: { type: String, default: null, index: true },
    /** Human-readable summary of what changed. */
    detail: { type: String, default: '' },
  },
  { timestamps: true },
);

adminActionSchema.index({ createdAt: -1 });

export type AdminActionAttrs = InferSchemaType<typeof adminActionSchema>;
export type AdminActionDoc = HydratedDocument<AdminActionAttrs>;

export const AdminAction = model('AdminAction', adminActionSchema);
