import { asyncHandler } from '../lib/asyncHandler.js';
import { unprocessable } from '../lib/errors.js';
import { deliverOtpByProviderRef } from '../services/orders.service.js';

/**
 * POST /api/v1/webhooks/sms  (public, no auth)
 *
 * A code pushed in from the upstream backend, already parsed there:
 *   { activationId, code }
 * `activationId` is the provider's activation id (== our `Order.providerRef`).
 * We synthesise the SMS text, find the matching `waiting` order and complete it.
 * Unknown activation → 200 ack (smsgecko is the end of the line).
 */
export const smsInbound = asyncHandler(async (req, res) => {
  const { activationId, code } = (req.body ?? {}) as {
    activationId?: string | number;
    code?: string | number;
  };

  const codeStr = code == null ? '' : String(code).trim();
  if (!activationId || !codeStr) {
    throw unprocessable('Webhook body needs activationId and code');
  }

  const result = await deliverOtpByProviderRef(
    String(activationId),
    codeStr,
    `Your verification code is ${codeStr}`,
  );
  res.status(200).json({ ok: true, ...result });
});
