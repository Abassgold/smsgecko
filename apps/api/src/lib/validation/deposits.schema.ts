import * as yup from 'yup';
import { DEPOSIT_METHODS, MIN_DEPOSIT_MICRO } from '@smsgecko/shared';
import type { DepositMethod } from '@smsgecko/shared';

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

export const webhookBody = yup.object({
  providerRef: yup.string().optional(),
  status: yup.string().optional(),
});
export interface WebhookBody {
  providerRef?: string;
  status?: string;
}
