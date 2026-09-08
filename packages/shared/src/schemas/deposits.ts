import { z } from 'zod';
import { DEPOSIT_METHODS, DEPOSIT_STATUSES, MIN_DEPOSIT_MICRO } from '../constants';

export const createDepositBody = z.object({
  method: z.enum(DEPOSIT_METHODS),
  amountMicro: z.number().int().min(MIN_DEPOSIT_MICRO),
});
export type CreateDepositBody = z.infer<typeof createDepositBody>;

export const depositView = z.object({
  id: z.string(),
  method: z.enum(DEPOSIT_METHODS),
  amountMicro: z.number().int(),
  status: z.enum(DEPOSIT_STATUSES),
  payAddress: z.string().nullable(),
  payUrl: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  confirmedAt: z.string().nullable(),
});
export type DepositView = z.infer<typeof depositView>;
