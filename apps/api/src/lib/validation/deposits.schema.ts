import * as yup from 'yup';
import { DEPOSIT_METHODS, KORAPAY_CURRENCIES, MIN_DEPOSIT_MICRO } from '@smsgecko/shared';
import type { DepositMethod, KorapayCurrency } from '@smsgecko/shared';
import { paginationFields } from './common.schema.js';

export const createDepositBody = yup.object({
  method: yup.mixed<DepositMethod>().oneOf([...DEPOSIT_METHODS]).required(),
  amountMicro: yup.number().integer().min(MIN_DEPOSIT_MICRO).required(),
  korapayCurrency: yup
    .mixed<KorapayCurrency>()
    .oneOf([...KORAPAY_CURRENCIES])
    .when('method', {
      is: 'korapay',
      then: (schema) => schema.required('korapayCurrency is required for method "korapay"'),
      otherwise: (schema) => schema.strip(),
    }),
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
