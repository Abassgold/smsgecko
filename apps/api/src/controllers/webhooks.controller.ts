import { asyncHandler } from '../lib/asyncHandler.js';
import { valid } from '../middleware/validation.js';
import { unprocessable } from '../lib/errors.js';
import type { SmsWebhookParams } from '../lib/validation/webhooks.schema.js';
import { deliverOtpByProviderRef } from '../services/orders.service.js';

type AnyRecord = Record<string, unknown>;

/**
 * Pull `{ code, text }` out of whatever body shape an upstream sent. Covers the
 * shapes seen from the SMS-Activate family (`{ code }`), smspool (`{ sms }`) and
 * smscode (`{ event, data: { otp_code, otp_message } }`), plus a few generic
 * aliases.
 */
function extractOtp(body: unknown): { code: string | null; text: string | null } {
  const b: AnyRecord = body && typeof body === 'object' ? (body as AnyRecord) : {};
  const nested = b.data && typeof b.data === 'object' ? (b.data as AnyRecord) : b;

  const pick = (...keys: string[]): string | null => {
    for (const src of [nested, b]) {
      for (const k of keys) {
        const v = src[k];
        if (v != null && v !== '') return String(v).trim();
      }
    }
    return null;
  };

  return {
    code: pick('otp_code', 'code', 'otp', 'pin'),
    text: pick('otp_message', 'full_sms', 'sms', 'text', 'message', 'body'),
  };
}

/**
 * POST /api/v1/webhooks/sms/:activationId  (public, no auth)
 *
 * A code delivery pushed in for the provider activation `:activationId`
 * (== our `Order.providerRef`). We find the matching `waiting` order and
 * complete it. Not our activation → 200 ack (nothing forwarded onward).
 */
export const smsInbound = asyncHandler(async (req, res) => {
  const { activationId } = valid<SmsWebhookParams>(req, 'params');
  const { code, text } = extractOtp(req.body);

  if (!code && !text) {
    throw unprocessable('Webhook body has no code or message text');
  }

  const result = await deliverOtpByProviderRef(activationId, code, text);
  res.status(200).json({ ok: true, ...result });
});
