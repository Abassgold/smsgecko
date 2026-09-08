import type { CreateDepositBody } from '@smsgecko/shared';
import { formatUsd } from '@smsgecko/shared';
import { Deposit, type DepositDoc } from '../../models/Deposit.js';
import type { UserDoc } from '../../models/User.js';
import { paymentProvider } from '../../providers/payment/index.js';
import { notify } from '../../models/Notification.js';
import { credit } from '../../lib/ledger.js';
import { getSettings } from '../../lib/settings.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';

export function toDepositView(d: DepositDoc) {
  return {
    id: d.id as string,
    method: d.method,
    amountMicro: d.amountMicro,
    status: d.status,
    payAddress: d.payAddress ?? null,
    payUrl: d.payUrl ?? null,
    createdAt: (d.get('createdAt') as Date).toISOString(),
    expiresAt: d.expiresAt.toISOString(),
    confirmedAt: d.confirmedAt ? d.confirmedAt.toISOString() : null,
  };
}

export async function createDeposit(user: UserDoc, body: CreateDepositBody): Promise<DepositDoc> {
  const { minDepositMicro } = await getSettings();
  if (body.amountMicro < minDepositMicro) {
    throw badRequest(`Minimum deposit is ${formatUsd(minDepositMicro)}`);
  }
  const charge = await paymentProvider.createCharge({
    amountMicro: body.amountMicro,
    method: body.method,
  });
  return Deposit.create({
    userId: user._id,
    method: body.method,
    amountMicro: body.amountMicro,
    status: 'pending',
    provider: paymentProvider.name,
    providerRef: charge.providerRef,
    payAddress: charge.payAddress,
    payUrl: charge.payUrl,
    expiresAt: charge.expiresAt,
  });
}

export async function getDeposit(user: UserDoc, id: string): Promise<DepositDoc> {
  const deposit = await Deposit.findOne({ _id: id, userId: user._id });
  if (!deposit) throw notFound('Deposit not found');
  return deposit;
}

/**
 * Confirm a pending deposit and credit the wallet. Guarded so it can only ever
 * settle once. Used by the dev mock-confirm endpoint and the payment webhook.
 */
export async function confirmDeposit(deposit: DepositDoc): Promise<DepositDoc> {
  const claimed = await Deposit.findOneAndUpdate(
    { _id: deposit._id, status: 'pending' },
    { $set: { status: 'confirmed', confirmedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!claimed) {
    const fresh = await Deposit.findById(deposit._id);
    throw conflict(`Deposit is already ${fresh?.status ?? 'resolved'}`);
  }

  await credit(claimed.userId, claimed.amountMicro, {
    type: 'deposit',
    description: `Deposit ${formatUsd(claimed.amountMicro)} via ${claimed.method}`,
    depositId: claimed._id,
  });
  await notify(
    claimed.userId,
    'deposit_confirmed',
    'Deposit confirmed',
    `${formatUsd(claimed.amountMicro)} was added to your balance.`,
  );

  return claimed;
}

export async function mockConfirm(user: UserDoc, id: string): Promise<DepositDoc> {
  const deposit = await getDeposit(user, id);
  return confirmDeposit(deposit);
}

export async function handleWebhook(
  provider: string,
  payload: { providerRef?: string; status?: string },
): Promise<{ ok: true }> {
  if (provider !== 'mock') throw badRequest('Unknown payment provider');
  if (!payload.providerRef) throw badRequest('Missing providerRef');
  if (payload.status !== 'confirmed') return { ok: true };

  const deposit = await Deposit.findOne({ providerRef: payload.providerRef });
  if (!deposit) throw notFound('Deposit not found');
  if (deposit.status === 'pending') await confirmDeposit(deposit);
  return { ok: true };
}
