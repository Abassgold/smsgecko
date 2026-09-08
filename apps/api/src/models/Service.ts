import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** A platform you can verify on (WhatsApp, Telegram, …). */
const serviceSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    /** Key the web app maps to an icon. */
    iconKey: { type: String, required: true },
    /** Alternate search terms, e.g. ["youtube", "gmail"] for Google. */
    aliases: { type: [String], default: [] },
    popular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 1000 },
  },
  { timestamps: true },
);

serviceSchema.index({ name: 'text', aliases: 'text' });

export type ServiceAttrs = InferSchemaType<typeof serviceSchema>;
export type ServiceDoc = HydratedDocument<ServiceAttrs>;
export const Service = model('Service', serviceSchema);
