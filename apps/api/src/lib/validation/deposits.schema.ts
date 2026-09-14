import * as yup from 'yup';
import { DEPOSIT_METHODS, MIN_DEPOSIT_MICRO } from '@smsgecko/shared';
import type { DepositMethod } from '@smsgecko/shared';
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
  ...paginationFields(100, 20),
});
export interface DepositsQuery {
  page: number;
  limit: number;
}
