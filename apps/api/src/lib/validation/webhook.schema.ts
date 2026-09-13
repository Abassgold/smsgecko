import * as yup from 'yup';

export const updateWebhookBody = yup.object({
  webhookUrl: yup.string().url('webhookUrl must be a valid URL').nullable().optional(),
  webhookSecret: yup
    .string()
    .min(16, 'webhookSecret must be at least 16 characters')
    .max(128)
    .optional(),
});
