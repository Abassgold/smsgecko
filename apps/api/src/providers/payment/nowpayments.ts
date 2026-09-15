import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { badRequest } from '../../lib/errors.js';
import type { Charge, CreateChargeInput, PaymentProvider } from './index.js';

// NowPayments hosted invoices default to a ~20 minute pay window; give our own
// bookkeeping some slack around that.
const CHARGE_TTL_MS = 60 * 60 * 1000;

function apiBase(): string {
  return env.NOWPAYMENTS_SANDBOX ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
}

/**
 * Real (sandbox by default) NowPayments integration via hand-rolled REST
 * calls — no SDK dependency. Uses the hosted Invoice flow (`payUrl` to a
 * NowPayments-hosted checkout page) rather than generating a pay address
 * ourselves, so we don't have to track exchange rates or coin selection.
 */
export class NowPaymentsProvider implements PaymentProvider {
  readonly name = 'nowpayments';

  constructor(private readonly apiKey: string) {}

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);

    const res = await fetch(`${apiBase()}/v1/invoice`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: input.amountMicro / 1_000_000,
        price_currency: 'usd',
        pay_currency: 'usdttrc20',
        ipn_callback_url: `${env.API_PUBLIC_URL}/api/v1/webhooks/payments/nowpayments`,
        success_url: `${env.APP_URL}/deposit?checkout=success&provider=nowpayments`,
        cancel_url: `${env.APP_URL}/deposit?checkout=cancel&provider=nowpayments`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { id?: string; invoice_url?: string; message?: string };
    if (!res.ok || !data.id || !data.invoice_url) {
      logger.warn({ status: res.status, message: data.message }, 'nowpayments invoice create failed');
      throw badRequest(data.message ?? 'Could not start a crypto payment');
    }

    return { providerRef: data.id, payAddress: null, payUrl: data.invoice_url, expiresAt };
  }
}

/** Recursively re-stringifies a value with object keys sorted — NowPayments
 * signs the IPN body over the JSON string with keys in sorted order, which
 * does not match the arbitrary key order `JSON.stringify` would otherwise
 * produce on the parsed-then-reserialized body. */
function sortedStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${sortedStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** HMAC-SHA512 over the sorted-key JSON payload, checked against the
 * `x-nowpayments-sig` header. */
export function verifyNowPaymentsSignature(
  body: unknown,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = createHmac('sha512', secret).update(sortedStringify(body)).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(header, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface NowPaymentsChargeEvent {
  providerRef: string;
  paid: boolean;
}

// Per NOWPayments' own status definitions: "confirmed" only means the
// blockchain confirmations have accumulated — funds haven't reached our
// wallet yet (that's "sending", then "finished"). Crediting on "confirmed"
// would settle the deposit before the money has actually arrived.
const PAID_STATUSES = new Set(['finished']);

/** Pulls the invoice id + paid state out of an IPN payload. */
export function parseNowPaymentsEvent(body: unknown): NowPaymentsChargeEvent | null {
  const payload = body as { invoice_id?: unknown; payment_id?: unknown; payment_status?: unknown };
  const id = payload?.invoice_id ?? payload?.payment_id;
  if (id === undefined || id === null) return null;
  return { providerRef: String(id), paid: PAID_STATUSES.has(String(payload.payment_status ?? '')) };
}
