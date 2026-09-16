import type { DepositMethod } from '@smsgecko/shared';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';
import { StripeProvider } from './stripe.js';
import { NowPaymentsProvider } from './nowpayments.js';
import { BachsProvider } from './bachs.js';
import { CryptomusProvider } from './cryptomus.js';

export interface CreateChargeInput {
  amountMicro: number;
  method: DepositMethod;
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

const stripeProvider = env.STRIPE_SECRET_KEY ? new StripeProvider(env.STRIPE_SECRET_KEY) : null;
const nowPaymentsProvider = env.NOWPAYMENTS_API_KEY
  ? new NowPaymentsProvider(env.NOWPAYMENTS_API_KEY)
  : null;
const bachsProvider = env.BACHS_API_KEY ? new BachsProvider(env.BACHS_API_KEY) : null;
const cryptomusProvider =
  env.CRYPTOMUS_MERCHANT_ID && env.CRYPTOMUS_API_KEY
    ? new CryptomusProvider(env.CRYPTOMUS_MERCHANT_ID, env.CRYPTOMUS_API_KEY)
    : null;

const PROVIDER_BY_METHOD: Partial<Record<DepositMethod, PaymentProvider | null>> = {
  card: stripeProvider,
  crypto_usdt: nowPaymentsProvider,
  bachs: bachsProvider,
  cryptomus: cryptomusProvider,
};

export function getPaymentProvider(method: DepositMethod): PaymentProvider {
  const provider = PROVIDER_BY_METHOD[method];
  if (!provider) throw badRequest(`${method} deposits are not available right now`);
  return provider;
}
export function getPaymentProviderByName(name: string): PaymentProvider | null {
  if (name === 'stripe') return stripeProvider;
  if (name === 'nowpayments') return nowPaymentsProvider;
  if (name === 'bachs') return bachsProvider;
  if (name === 'cryptomus') return cryptomusProvider;
  return null;
}
