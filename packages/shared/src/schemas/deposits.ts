import type { DepositMethod, DepositStatus, KorapayCurrency } from '../constants';

export interface CreateDepositBody {
  method: DepositMethod;
  amountMicro: number;
  /** Required when method is `korapay` — which African corridor/currency to bill in. */
  korapayCurrency?: KorapayCurrency;
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
