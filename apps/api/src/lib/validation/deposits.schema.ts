import * as yup from 'yup';
import { DEPOSIT_METHODS, DEPOSIT_STATUSES, MIN_DEPOSIT_MICRO } from '@smsgecko/shared';
import type { DepositMethod, DepositStatus } from '@smsgecko/shared';
import { paginationFields } from './common.schema.js';

export const createDepositBody = yup.object({
  method: yup.mixed<DepositMethod>().oneOf([...DEPOSIT_METHODS]).required(),
  amountMicro: yup.number().integer().min(MIN_DEPOSIT_MICRO).required(),
});

export const providerParams = yup.object({
  provider: yup.string().trim().required(),
});
export interface ProviderParams {
  provider: string;
}

export const depositsQuery = yup.object({
  status: yup
    .mixed<DepositStatus | 'all'>()
    .oneOf(['all', ...DEPOSIT_STATUSES])
    .default('all'),
  ...paginationFields(100, 20),
});
export interface DepositsQuery {
  status: DepositStatus | 'all';
  page: number;
  limit: number;
}
