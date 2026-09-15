import { randomBytes, randomUUID } from 'node:crypto';
import type { DepositMethod, KorapayCurrency } from '@smsgecko/shared';
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
  /** Which of Korapay's African corridors to bill in (NGN/GHS/KES/ZAR). Ignored by every other provider. */
  korapayCurrency?: KorapayCurrency;
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
 * every real method (`card`/`korapay`/`crypto_usdt`/`cryptomus`) when that
 * provider's credentials aren't configured. See `StripeProvider` and the
 * other provider files for the real integrations.
 *
 * Every real gateway here sends the customer to a hosted checkout page —
 * Stripe Checkout, Korapay's charge page, NowPayments'/Cryptomus' invoice
 * page. The mock fallback matches that: it always returns a `payUrl`
 * (a same-origin `/deposit/checkout/:id` page, not an external one) instead
 * of surfacing pay details inline on the deposit form, so the flow looks and
 * behaves the same regardless of whether real credentials are configured.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const providerRef = `pay_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);
    const payAddress =
      input.method === 'crypto_usdt' ? `T${randomBytes(16).toString('hex').slice(0, 33)}` : null;

    // The real deposit id doesn't exist yet at this point (the Deposit
    // document is created right after this call returns) — createDeposit()
    // rewrites this placeholder path to the real `/deposit/checkout/<id>`
    // once it does.
    return { providerRef, payAddress, payUrl: `/deposit/checkout/${providerRef}`, expiresAt };
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
