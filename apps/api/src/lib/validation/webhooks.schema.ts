import * as yup from 'yup';

/** `:activationId` in POST /api/v1/webhooks/sms/:activationId — the provider's
 *  activation id, i.e. our `Order.providerRef`. */
export const smsWebhookParams = yup.object({
  activationId: yup.string().trim().min(1).max(128).required(),
});
export interface SmsWebhookParams {
  activationId: string;
}
