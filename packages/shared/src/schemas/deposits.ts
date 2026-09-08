import type { DepositMethod, DepositStatus } from '../constants';

export interface CreateDepositBody {
  method: DepositMethod;
  amountMicro: number;
}

export interface DepositView {
  id: string;
  method: DepositMethod;
  amountMicro: number;
  status: DepositStatus;
  payAddress: string | null;
  payUrl: string | null;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
}
