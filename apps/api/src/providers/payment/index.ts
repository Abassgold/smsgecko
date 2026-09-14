import { randomBytes, randomUUID } from 'node:crypto';
import type { DepositMethod } from '@smsgecko/shared';
import { env } from '../../config/env.js';
import { StripeProvider } from './stripe.js';
import { NowPaymentsProvider } from './nowpayments.js';
import { KorapayProvider } from './korapay.js';
import { CryptomusProvider } from './cryptomus.js';

export interface CreateChargeInput {
  amountMicro: number;
  method: DepositMethod;
  /** Needed by gateways that require a customer identity up front (Korapay). Unused by the rest. */
  userEmail: string;
}

export interface Charge {
  providerRef: string;
  payAddress: string | null;
  payUrl: string | null;
  expiresAt: Date;
}

export interface PaymentProvider {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<Charge>;
}

const CHARGE_TTL_MS = 30 * 60 * 1000;

/**
 * Simulated PSP — always available, used in tests and as the fallback for
 * `card`/`crypto_usdt` when Stripe/NowPayments credentials aren't configured.
 * See `StripeProvider` and `NowPaymentsProvider` for the real integrations.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const providerRef = `pay_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);

    if (input.method === 'crypto_usdt') {
      return {
        providerRef,
        payAddress: `T${randomBytes(16).toString('hex').slice(0, 33)}`,
        payUrl: null,
        expiresAt,
      };
    }
    return { providerRef, payAddress: null, payUrl: `/deposit/checkout/${providerRef}`, expiresAt };
  }
}

// Real integrations (Stripe for cards, NowPayments for crypto) are selected
// by method and only used when their API key is configured — same
// unset-means-fall-back-to-a-safe-default pattern as RESEND_API_KEY for
// email. Imported lazily-ish (at module load, not per-call) so a missing key
// simply means these stay null, never a thrown error at startup.
const mockProvider = new MockPaymentProvider();
const stripeProvider = env.STRIPE_SECRET_KEY ? new StripeProvider(env.STRIPE_SECRET_KEY) : null;
const nowPaymentsProvider = env.NOWPAYMENTS_API_KEY
  ? new NowPaymentsProvider(env.NOWPAYMENTS_API_KEY)
  : null;
const korapayProvider = env.KORAPAY_SECRET_KEY ? new KorapayProvider(env.KORAPAY_SECRET_KEY) : null;
const cryptomusProvider =
  env.CRYPTOMUS_MERCHANT_ID && env.CRYPTOMUS_API_KEY
    ? new CryptomusProvider(env.CRYPTOMUS_MERCHANT_ID, env.CRYPTOMUS_API_KEY)
    : null;

/** Selects the provider for a new charge, by deposit method. */
export function getPaymentProvider(method: DepositMethod): PaymentProvider {
  if (method === 'card') return stripeProvider ?? mockProvider;
  if (method === 'crypto_usdt') return nowPaymentsProvider ?? mockProvider;
  if (method === 'korapay') return korapayProvider ?? mockProvider;
  if (method === 'cryptomus') return cryptomusProvider ?? mockProvider;
  return mockProvider;
}

/** Selects a provider for inbound webhook dispatch, by the provider name in
 * the URL (`/webhooks/payments/:provider`) — not the same key as the deposit
 * method above, since one provider can back more than one method. */
export function getPaymentProviderByName(name: string): PaymentProvider | null {
  if (name === 'mock') return mockProvider;
  if (name === 'stripe') return stripeProvider;
  if (name === 'nowpayments') return nowPaymentsProvider;
  if (name === 'korapay') return korapayProvider;
  if (name === 'cryptomus') return cryptomusProvider;
  return null;
}
