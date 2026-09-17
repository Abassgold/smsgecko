import { createHash, randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { badRequest } from '../../lib/errors.js';
import type { Charge, CreateChargeInput, PaymentProvider } from './index.js';

const API_BASE = 'https://api.cryptomus.com/v1';
const CHARGE_TTL_MS = 60 * 60 * 1000;

/**
 * Cryptomus signs requests/webhooks as MD5(base64(JSON.stringify(payload)) + apiKey)
 * — but over their PHP-side `json_encode`, which escapes forward slashes
 * (`/` → `\/`); JSON.stringify does not. Their own docs call this out
 * explicitly, since it silently breaks the signature the moment any field
 * contains a `/` — which every request here does (url_callback etc. are
 * full URLs). Replicate the escaping by hand or our signature never matches
 * theirs.
 */
function sign(payload: unknown, apiKey: string): string {
  const json = JSON.stringify(payload).replace(/\//g, '\\/');
  const encoded = Buffer.from(json).toString('base64');
  return createHash('md5').update(encoded + apiKey).digest('hex');
}

/**
 * Real (test-mode) Cryptomus integration via hand-rolled REST calls — a
 * second crypto processor alongside NowPayments, settled in USD (Cryptomus
 * converts to the payer's chosen coin itself, no `pay_currency` needed here).
 */
export class CryptomusProvider implements PaymentProvider {
  readonly name = 'cryptomus';

  constructor(
    private readonly merchantId: string,
    private readonly apiKey: string,
  ) {}

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const orderId = `dep_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);

    const payload = {
      amount: (input.amountMicro / 1_000_000).toFixed(2),
      currency: 'USD',
      order_id: orderId,
      url_callback: `${env.API_PUBLIC_URL}/api/v1/webhooks/payments/cryptomus`,
      url_return: `${env.APP_URL}/deposit?checkout=cancel&provider=cryptomus`,
      url_success: `${env.APP_URL}/deposit?checkout=success&provider=cryptomus`,
    };

    const res = await fetch(`${API_BASE}/payment`, {
      method: 'POST',
      headers: {
        merchant: this.merchantId,
        sign: sign(payload, this.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { result?: { url?: string }; message?: string };
    if (!res.ok || !body.result?.url) {
      // Logged for us; the customer gets a clean, generic message —
      // Cryptomus' own text can reference internal details that aren't
      // ours to show.
      logger.warn({ status: res.status, message: body.message }, 'cryptomus payment create failed');
      throw badRequest('Could not start a Cryptomus payment. Please try again.');
    }

    return { providerRef: orderId, payAddress: null, payUrl: body.result.url, expiresAt };
  }
}

const PAID_STATUSES = new Set(['paid', 'paid_over']);

export interface CryptomusChargeEvent {
  providerRef: string;
  paid: boolean;
}

/**
 * Verifies the `sign` field against MD5(base64(JSON.stringify(rest)) +
 * apiKey) — the signature covers every other field in the payload, so it
 * must be checked and parsed together rather than as two independent steps.
 */
export function verifyAndParseCryptomusEvent(
  body: unknown,
  apiKey: string,
): CryptomusChargeEvent | null {
  const payload = body as Record<string, unknown> & { sign?: string; order_id?: string; status?: string };
  const receivedSign = payload?.sign;
  if (!receivedSign || !payload.order_id) return null;

  const { sign: _sign, ...rest } = payload;
  void _sign;
  if (sign(rest, apiKey) !== receivedSign) return null;

  return { providerRef: payload.order_id, paid: PAID_STATUSES.has(String(payload.status ?? '')) };
}
