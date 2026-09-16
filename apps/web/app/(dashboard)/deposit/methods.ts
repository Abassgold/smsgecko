import type { DepositMethod } from '@smsgecko/shared';

export interface DepositMethodInfo {
  method: DepositMethod;
  label: string;
  blurb: string;
  group: 'fiat' | 'crypto';
  /** Processor's own cut, shown inline next to the method — same
   * transparency trick as most SMS-verification sites' deposit pickers. */
  fee: string;
}

/** Methods shown on the /deposit picker — `ewallet`/`qris` stay in the shared
 * enum for backward compatibility but have no provider behind them, so they're
 * left off here rather than shown as dead options. */
export const DEPOSIT_METHOD_INFO: DepositMethodInfo[] = [
  {
    method: 'card',
    label: 'Card',
    blurb: 'Visa & Mastercard, via Stripe Checkout.',
    group: 'fiat',
    fee: '2.9% + $0.30',
  },
  {
    method: 'bachs',
    label: 'Bachs',
    blurb: 'African bank transfer & mobile money — Nigeria, Ghana, Kenya, Uganda & more.',
    group: 'fiat',
    fee: '1.5%–3%',
  },
  {
    method: 'crypto_usdt',
    label: 'USDT',
    blurb: 'Crypto checkout via NowPayments.',
    group: 'crypto',
    fee: '0.5%',
  },
  {
    method: 'cryptomus',
    label: 'Cryptomus',
    blurb: 'Alternative crypto checkout — BTC, ETH, USDT & more.',
    group: 'crypto',
    fee: 'from 0.4%',
  },
];

export function depositMethodInfo(method: string): DepositMethodInfo | undefined {
  return DEPOSIT_METHOD_INFO.find((m) => m.method === method);
}

export const GROUP_LABEL: Record<DepositMethodInfo['group'], string> = {
  fiat: 'Card & bank',
  crypto: 'Crypto',
};
