import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const adminActionSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null, index: true },
    detail: { type: String, default: '' },
  },
  { timestamps: true },
);

adminActionSchema.index({ createdAt: -1 });

export type AdminActionAttrs = InferSchemaType<typeof adminActionSchema>;
export type AdminActionDoc = HydratedDocument<AdminActionAttrs>;

export const AdminAction = model('AdminAction', adminActionSchema);
