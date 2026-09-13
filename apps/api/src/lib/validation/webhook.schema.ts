import * as yup from 'yup';

export const updateWebhookBody = yup.object({
  webhookUrl: yup.string().url('webhookUrl must be a valid URL').nullable().optional(),
  webhookSecret: yup
    .string()
    .min(16, 'webhookSecret must be at least 16 characters')
    .max(128)
    .optional(),
  // Replace the current secret with a fresh server-generated one. Ignored if
  // webhookSecret is also given (an explicit value always wins).
  regenerateSecret: yup.boolean().optional(),
});
