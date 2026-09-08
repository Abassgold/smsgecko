import * as yup from 'yup';
import { DEPOSIT_STATUSES, TRANSACTION_TYPES } from '@smsgecko/shared';
import type { DepositStatus, TransactionType } from '@smsgecko/shared';
import { objectId, paginationFields } from '../common.schema.js';

const TRANSACTION_TYPE_FILTERS = ['all', ...TRANSACTION_TYPES] as const;
const DEPOSIT_STATUS_FILTERS = ['all', ...DEPOSIT_STATUSES] as const;

export const adminTransactionsQuery = yup.object({
  type: yup
    .mixed<TransactionType | 'all'>()
    .oneOf([...TRANSACTION_TYPE_FILTERS])
    .default('all'),
  userId: objectId.optional(),
  ...paginationFields(100, 25),
});
export interface AdminTransactionsQuery {
  type: TransactionType | 'all';
  userId?: string;
  page: number;
  limit: number;
}

export const adminDepositsQuery = yup.object({
  status: yup
    .mixed<DepositStatus | 'all'>()
    .oneOf([...DEPOSIT_STATUS_FILTERS])
    .default('all'),
  ...paginationFields(100, 25),
});
export interface AdminDepositsQuery {
  status: DepositStatus | 'all';
  page: number;
  limit: number;
}

export const updateDepositBody = yup.object({
  status: yup.mixed<'confirmed' | 'failed'>().oneOf(['confirmed', 'failed']).required(),
});
