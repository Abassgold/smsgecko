import { asyncHandler } from '../lib/asyncHandler.js';
import { unprocessable } from '../lib/errors.js';
import { deliverOtpByProviderRef } from '../services/orders.service.js';

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
