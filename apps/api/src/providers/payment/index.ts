import type { DepositMethod, KorapayCurrency } from '@smsgecko/shared';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';
import { StripeProvider } from './stripe.js';
import { NowPaymentsProvider } from './nowpayments.js';
import { KorapayProvider } from './korapay.js';
import { CryptomusProvider } from './cryptomus.js';

export interface CreateChargeInput {
  amountMicro: number;
  method: DepositMethod;
  userEmail: string;
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

// Each real gateway is only instantiated when its own credentials are set —
// same unset-means-disabled pattern as RESEND_API_KEY for email. Built once
// at module load, not per-request, so a missing key simply means the
// provider stays null here rather than throwing at startup.
const stripeProvider = env.STRIPE_SECRET_KEY ? new StripeProvider(env.STRIPE_SECRET_KEY) : null;
const nowPaymentsProvider = env.NOWPAYMENTS_API_KEY
  ? new NowPaymentsProvider(env.NOWPAYMENTS_API_KEY)
  : null;
const korapayProvider = env.KORAPAY_SECRET_KEY ? new KorapayProvider(env.KORAPAY_SECRET_KEY) : null;
const cryptomusProvider =
  env.CRYPTOMUS_MERCHANT_ID && env.CRYPTOMUS_API_KEY
    ? new CryptomusProvider(env.CRYPTOMUS_MERCHANT_ID, env.CRYPTOMUS_API_KEY)
    : null;

const PROVIDER_BY_METHOD: Partial<Record<DepositMethod, PaymentProvider | null>> = {
  card: stripeProvider,
  crypto_usdt: nowPaymentsProvider,
  korapay: korapayProvider,
  cryptomus: cryptomusProvider,
};

/**
 * Selects the provider for a new charge, by deposit method. Throws rather
 * than degrading to a fake payment when the method's gateway isn't
 * configured — there is no mock/fallback path here. A deposit only ever
 * exists once a real (or sandbox) provider has actually issued a charge and
 * handed back its own hosted checkout URL.
 */
export function getPaymentProvider(method: DepositMethod): PaymentProvider {
  const provider = PROVIDER_BY_METHOD[method];
  if (!provider) throw badRequest(`${method} deposits are not available right now`);
  return provider;
}

/** Selects a provider for inbound webhook dispatch, by the provider name in
 * the URL (`/webhooks/payments/:provider`) — not the same key as the deposit
 * method above, since one provider can back more than one method. */
export function getPaymentProviderByName(name: string): PaymentProvider | null {
  if (name === 'stripe') return stripeProvider;
  if (name === 'nowpayments') return nowPaymentsProvider;
  if (name === 'korapay') return korapayProvider;
  if (name === 'cryptomus') return cryptomusProvider;
  return null;
}
