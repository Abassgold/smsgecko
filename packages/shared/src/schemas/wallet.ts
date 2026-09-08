import type { TransactionType } from '../constants';

export interface WalletResponse {
  balanceMicro: number;
}

export interface TransactionView {
  id: string;
  type: TransactionType;
  amountMicro: number;
  balanceAfterMicro: number;
  description: string;
  orderId: string | null;
  depositId: string | null;
  createdAt: string;
}

/** `type` filter accepts every transaction type plus `all`, `credits`, `debits`. */
export type TransactionsTypeFilter = TransactionType | 'all' | 'credits' | 'debits';
