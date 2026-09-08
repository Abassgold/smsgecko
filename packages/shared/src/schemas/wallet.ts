import { z } from 'zod';
import { TRANSACTION_TYPES } from '../constants';

export const walletResponse = z.object({
  balanceMicro: z.number().int(),
});
export type WalletResponse = z.infer<typeof walletResponse>;

export const transactionView = z.object({
  id: z.string(),
  type: z.enum(TRANSACTION_TYPES),
  amountMicro: z.number().int(),
  balanceAfterMicro: z.number().int(),
  description: z.string(),
  orderId: z.string().nullable(),
  depositId: z.string().nullable(),
  createdAt: z.string(),
});
export type TransactionView = z.infer<typeof transactionView>;

export const transactionsQuery = z.object({
  type: z.enum(['all', 'credits', 'debits', ...TRANSACTION_TYPES]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
