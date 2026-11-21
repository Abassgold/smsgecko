import * as yup from 'yup';

export const offerDisabledBody = yup.object({
  serviceCode: yup.string().trim().min(1).max(64).required(),
  countryCode: yup.string().trim().min(1).max(64).required(),
  disabled: yup.boolean().required(),
});
export type OfferDisabledBody = yup.InferType<typeof offerDisabledBody>;
