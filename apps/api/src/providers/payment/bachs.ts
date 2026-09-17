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

// The African bank-transfer/mobile-money corridors Bachs replaces Korapay
// with. Deliberately excludes USD_CARD/NGN_CARD (Stripe already covers
// cards) and CRYPTO (NowPayments/Cryptomus already cover crypto) — each
// provider here owns one lane, so a Bachs checkout only ever offers the
// corridors nothing else in this app does.
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

/**
 * Real (sandbox by default) Bachs integration via hand-rolled REST calls —
 * replaces Korapay. Bachs prices every checkout in USD and converts to
 * whichever corridor the customer picks on their own hosted page, so unlike
 * Korapay we never need to know the target currency up front or maintain our
 * own FX rate table — Bachs absorbs the conversion entirely on their side.
 */
export class BachsProvider implements PaymentProvider {
  readonly name = 'bachs';

  constructor(private readonly apiKey: string) {}

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    // Bachs has no product-less "raw amount" providerRef of its own until
    // the session is created, but it does accept our own `reference` for
    // dashboard readability — generate one up front, same pattern as
    // Cryptomus's locally-minted order_id.
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
      // Logged for us; the customer gets a clean, generic message —
      // Bachs' own text can reference internal details that aren't ours to
      // show.
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

/**
 * Verifies the preferred `X-Bachs-Signature-V2` header: `t=<unix ts>,
 * v1=<hex hmac>[,v1=<hex hmac>...]`, where the hmac is
 * HMAC-SHA256(`${t}.${rawBody}`, webhookSecret). Multiple `v1=` entries can
 * appear during a secret rotation — any match is accepted. Verification
 * needs the exact raw request bytes (see `req.rawBody` in app.ts), not a
 * re-serialized copy of the parsed JSON. A 5-minute tolerance on the
 * timestamp guards against replay of a captured payload.
 */
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
