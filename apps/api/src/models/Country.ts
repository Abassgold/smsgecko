import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const countrySchema = new Schema(
  {
    /** ISO 3166-1 alpha-2, lowercase (e.g. "id", "us"). */
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    /** International dialing prefix without "+" (e.g. "62", "1"). */
    dialCode: { type: String, required: true },
    flagEmoji: { type: String, required: true },
    sortOrder: { type: Number, default: 1000 },
  },
  { timestamps: true },
);

countrySchema.index({ name: 'text' });

export type CountryAttrs = InferSchemaType<typeof countrySchema>;
export type CountryDoc = HydratedDocument<CountryAttrs>;
export const Country = model('Country', countrySchema);
