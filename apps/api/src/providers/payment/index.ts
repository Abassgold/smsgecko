import { randomBytes, randomUUID } from 'node:crypto';
import type { DepositMethod } from '@smsgecko/shared';

export interface CreateChargeInput {
  amountMicro: number;
  method: DepositMethod;
}

export interface Charge {
  providerRef: string;
  payAddress: string | null;
  payUrl: string | null;
  expiresAt: Date;
}

export interface PaymentProvider {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<Charge>;
}

const CHARGE_TTL_MS = 30 * 60 * 1000;

/**
 * Simulated PSP. Real integrations (crypto processor, e-wallet aggregator) would
 * implement this interface and be selected by env / by `method`.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const providerRef = `pay_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);

    if (input.method === 'crypto_usdt') {
      return {
        providerRef,
        payAddress: `T${randomBytes(16).toString('hex').slice(0, 33)}`,
        payUrl: null,
        expiresAt,
      };
    }
    return { providerRef, payAddress: null, payUrl: `/deposit/checkout/${providerRef}`, expiresAt };
  }
}

export const paymentProvider = new MockPaymentProvider();
