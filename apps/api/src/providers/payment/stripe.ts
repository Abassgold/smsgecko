import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { badRequest } from '../../lib/errors.js';
import type { Charge, CreateChargeInput, PaymentProvider } from './index.js';

const API_BASE = 'https://api.stripe.com/v1';
// Stripe requires a Checkout Session's `expires_at` to be at least 30 minutes
// out; give it a full hour so a slow checkout doesn't race our own window.
const CHARGE_TTL_MS = 60 * 60 * 1000;

/**
 * Real (test-mode) Stripe integration via hand-rolled REST calls — no `stripe`
 * SDK dependency, same style as the hand-rolled TOTP/webhook-signing already
 * in this codebase. Card deposits become a hosted Checkout Session; the
 * session id is the `providerRef` we store and later match against the
 * `checkout.session.completed` webhook event.
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';

  constructor(private readonly secretKey: string) {}

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const amountCents = Math.round(input.amountMicro / 10_000);
    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);

    const params = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': 'SMSGecko wallet deposit',
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][quantity]': '1',
      success_url: `${env.APP_URL}/deposit?stripe=success`,
      cancel_url: `${env.APP_URL}/deposit?stripe=cancel`,
      expires_at: String(Math.floor(expiresAt.getTime() / 1000)),
    });

    const res = await fetch(`${API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !data.id || !data.url) {
      logger.warn({ status: res.status, error: data.error }, 'stripe checkout session create failed');
      throw badRequest(data.error?.message ?? 'Could not start a card payment');
    }

    return { providerRef: data.id, payAddress: null, payUrl: data.url, expiresAt };
  }
}

/**
 * Stripe's signature scheme: the `Stripe-Signature` header is
 * `t=<unix ts>,v1=<hex hmac>[,v1=<hex hmac>...]`, where the hmac is
 * HMAC-SHA256(`${t}.${rawBody}`, webhookSecret). Verification needs the exact
 * raw request bytes (captured on `req.rawBody`, see app.ts), not a
 * re-serialized copy of the parsed JSON. A 5-minute tolerance on the
 * timestamp guards against replay of a captured payload.
 */
export function verifyStripeSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const parts = new Map(
    header.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k, v] as [string, string];
    }),
  );
  const timestamp = parts.get('t');
  const signature = parts.get('v1');
  if (!timestamp || !signature) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 5 * 60) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface StripeChargeEvent {
  providerRef: string;
  paid: boolean;
}

/** Pulls the Checkout Session id + paid state out of a `checkout.session.completed` event. */
export function parseStripeEvent(body: unknown): StripeChargeEvent | null {
  const event = body as { type?: string; data?: { object?: { id?: string; payment_status?: string } } };
  if (event?.type !== 'checkout.session.completed') return null;
  const session = event.data?.object;
  if (!session?.id) return null;
  return { providerRef: session.id, paid: session.payment_status === 'paid' };
}
