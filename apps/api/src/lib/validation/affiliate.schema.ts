import * as yup from 'yup';

export const acceptTermsBody = yup.object({
  version: yup.string().trim().min(1).max(120).required(),
});
