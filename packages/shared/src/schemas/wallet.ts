import type { TransactionType } from '../constants';

export interface WalletResponse {
  balanceMicro: number;
}

export interface TransactionView {
  id: string;
  type: TransactionType;
  amountMicro: number;
  /** Wallet balance immediately before / after this entry (`before + amount === after`). */
  balanceBeforeMicro: number;
  balanceAfterMicro: number;
  description: string;
  orderId: string | null;
  depositId: string | null;
  /** Pairs a charge with the refund that reverses it — see the API for the format. */
  reference: string | null;
  createdAt: string;
}

/** `type` filter accepts every transaction type plus `all`, `credits`, `debits`. */
export type TransactionsTypeFilter = TransactionType | 'all' | 'credits' | 'debits';
