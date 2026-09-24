import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { badRequest } from '../../lib/errors.js';
import type { Charge, CreateChargeInput, PaymentProvider } from './index.js';

const CHARGE_TTL_MINUTES = 30;

function apiBase(): string {
  return env.BACHS_SANDBOX ? 'https://sandbox-api.bachs.io' : 'https://api.bachs.io';
}

const CORRIDORS = [
  'NGN_BANK_TRANSFER',
  'MOMO_GHS',
  'MOMO_KES',
  'MOMO_TZS',
  'MOMO_UGX',
  'MOMO_XAF',
  'MOMO_XOF',
  'MOMO_RWF',
  'MOMO_MWK',
  'MOMO_ZMW',
];

export class BachsProvider implements PaymentProvider {
  readonly name = 'bachs';

  constructor(private readonly apiKey: string) {}

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const reference = `dep_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

    const res = await fetch(`${apiBase()}/v1/checkout-sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pricing: { currency: 'USD', amount: (input.amountMicro / 1_000_000).toFixed(2) },
        customer: { email: input.userEmail },
        // payment_method_types: CORRIDORS,
        success_url: `${env.APP_URL}/deposit?checkout=success&provider=bachs`,
        cancel_url: `${env.APP_URL}/deposit?checkout=cancel&provider=bachs`,
        reference,
        expires_in_minutes: CHARGE_TTL_MINUTES,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as {
      checkout_id?: string;
      checkout_url?: string;
      expires_at?: string;
      message?: string;
    };
    if (!res.ok || !data.checkout_id || !data.checkout_url) {
      logger.warn({ status: res.status, message: data.message }, 'bachs checkout session create failed');
      throw badRequest('Could not start a Bachs payment. Please try again.');
    }

    return {
      providerRef: data.checkout_id,
      payAddress: null,
      payUrl: data.checkout_url,
      expiresAt: data.expires_at
        ? new Date(data.expires_at)
        : new Date(Date.now() + CHARGE_TTL_MINUTES * 60_000),
    };
  }
}

export function verifyBachsSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=', 2) as [string, string]);
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 5 * 60) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  return signatures.some((sig) => {
    const b = Buffer.from(sig, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export interface BachsChargeEvent {
  providerRef: string;
  paid: boolean;
}

const RELEVANT_EVENTS = new Set(['collection.succeeded', 'collection.failed', 'collection.underpaid']);

/** Pulls the checkout id + paid state out of a `collection.*` webhook event.
 * Bachs guarantees at-least-once delivery and may add unrecognized event
 * types or extra fields over time — anything outside `RELEVANT_EVENTS` is
 * ignored rather than rejected. */
export function parseBachsEvent(body: unknown): BachsChargeEvent | null {
  const event = body as { type?: string; data?: { checkout_id?: string } };
  if (!event?.type || !RELEVANT_EVENTS.has(event.type)) return null;
  const checkoutId = event.data?.checkout_id;
  if (!checkoutId) return null;
  return { providerRef: checkoutId, paid: event.type === 'collection.succeeded' };
}
