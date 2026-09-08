import * as yup from 'yup';

export const createApiKeyBody = yup.object({
  label: yup.string().trim().min(1).max(60).default('API key'),
});
