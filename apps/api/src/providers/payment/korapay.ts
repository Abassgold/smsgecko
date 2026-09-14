import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { badRequest } from '../../lib/errors.js';
import { getSettings } from '../../lib/settings.js';
import type { Charge, CreateChargeInput, PaymentProvider } from './index.js';

const API_BASE = 'https://api.korapay.com/merchant/api/v1';
const CHARGE_TTL_MS = 30 * 60 * 1000;

/**
 * Real (test-mode) Korapay integration via hand-rolled REST calls — cards,
 * bank transfer and USSD for Nigeria, via one hosted checkout. Korapay only
 * settles in NGN, so the USD deposit amount is converted using the
 * admin-set `usdToNgnRate` (no live FX feed — see Settings > Payments).
 */
export class KorapayProvider implements PaymentProvider {
  readonly name = 'korapay';

  constructor(private readonly secretKey: string) {}

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const { usdToNgnRate } = await getSettings();
    const amountNgn = Math.round((input.amountMicro / 1_000_000) * usdToNgnRate * 100) / 100;
    const reference = `dep_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);

    const res = await fetch(`${API_BASE}/charges/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountNgn,
        currency: 'NGN',
        reference,
        customer: { email: input.userEmail },
        notification_url: `${env.API_PUBLIC_URL}/api/v1/webhooks/payments/korapay`,
        redirect_url: `${env.APP_URL}/deposit?checkout=success&provider=korapay`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { checkout_url?: string };
    };
    if (!res.ok || !body.status || !body.data?.checkout_url) {
      logger.warn({ status: res.status, message: body.message }, 'korapay charge initialize failed');
      throw badRequest(body.message ?? 'Could not start a Korapay payment');
    }

    return { providerRef: reference, payAddress: null, payUrl: body.data.checkout_url, expiresAt };
  }
}

/**
 * Korapay signs only the `data` object of the webhook payload —
 * HMAC-SHA256(JSON.stringify(data), secretKey) — checked against the
 * `x-korapay-signature` header. Same secret key used for API auth, no
 * separate webhook secret.
 */
export function verifyKorapaySignature(data: unknown, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(header, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface KorapayChargeEvent {
  providerRef: string;
  paid: boolean;
}

/** Pulls the reference + paid state out of a `charge.success`/`charge.failed` event. */
export function parseKorapayEvent(body: unknown): KorapayChargeEvent | null {
  const event = body as { event?: string; data?: { reference?: string; status?: string } };
  const reference = event?.data?.reference;
  if (!reference) return null;
  return { providerRef: reference, paid: event?.event === 'charge.success' && event.data?.status === 'success' };
}
