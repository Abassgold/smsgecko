import * as yup from 'yup';
import { TRANSACTION_TYPES } from '@smsgecko/shared';
import type { TransactionsTypeFilter } from '@smsgecko/shared';
import { paginationFields } from './common.schema.js';

const TRANSACTION_TYPE_FILTERS = ['all', 'credits', 'debits', ...TRANSACTION_TYPES] as const;

export const transactionsQuery = yup.object({
  type: yup
    .mixed<TransactionsTypeFilter>()
    .oneOf([...TRANSACTION_TYPE_FILTERS])
    .default('all'),
  ...paginationFields(100, 20),
});
export interface TransactionsQuery {
  type: TransactionsTypeFilter;
  page: number;
  limit: number;
}
