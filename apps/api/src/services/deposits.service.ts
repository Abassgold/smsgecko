import type { CreateDepositBody } from '@smsgecko/shared';
import { formatUsd } from '@smsgecko/shared';
import { Deposit, type DepositDoc } from '../models/Deposit.js';
import type { UserDoc } from '../models/User.js';
import { getPaymentProvider, getPaymentProviderByName } from '../providers/payment/index.js';
import { verifyStripeSignature, parseStripeEvent } from '../providers/payment/stripe.js';
import { verifyNowPaymentsSignature, parseNowPaymentsEvent } from '../providers/payment/nowpayments.js';
import { verifyKorapaySignature, parseKorapayEvent } from '../providers/payment/korapay.js';
import { verifyAndParseCryptomusEvent } from '../providers/payment/cryptomus.js';
import { notify } from '../models/Notification.js';
import { credit } from '../lib/ledger.js';
import { getSettings } from '../lib/settings.js';
import { env } from '../config/env.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

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
  const provider = getPaymentProvider(body.method);
  const charge = await provider.createCharge({
    amountMicro: body.amountMicro,
    method: body.method,
    userEmail: user.email,
    korapayCurrency: body.korapayCurrency,
  });
  return Deposit.create({
    userId: user._id,
    method: body.method,
    amountMicro: body.amountMicro,
    status: 'pending',
    provider: provider.name,
    providerRef: charge.providerRef,
    payAddress: charge.payAddress,
    payUrl: charge.payUrl,
    expiresAt: charge.expiresAt,
  });
}

export interface ListDepositsParams {
  page: number;
  limit: number;
}

export async function listDeposits(user: UserDoc, params: ListDepositsParams) {
  const filter = { userId: user._id };
  const [items, total] = await Promise.all([
    Deposit.find(filter)
      .sort({ createdAt: -1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit),
    Deposit.countDocuments(filter),
  ]);
  return {
    items: items.map(toDepositView),
    total,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
  };
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

async function confirmByProviderRef(providerName: string, providerRef: string): Promise<void> {
  const deposit = await Deposit.findOne({ providerRef, provider: providerName });
  if (!deposit) throw notFound('Deposit not found');
  if (deposit.status === 'pending') await confirmDeposit(deposit);
}

/** Minimal shape `handleWebhook` needs from the inbound request — matches
 * Express's `Request` structurally without importing its types into the
 * service layer. `rawBody` is only present for routes behind the
 * `express.json()` verify callback (see app.ts), which all routes are. */
export interface WebhookRequest {
  body: unknown;
  rawBody?: Buffer;
  header(name: string): string | undefined;
}

/**
 * Dispatches an inbound payment-provider webhook. Deliberately does NOT run
 * through the generic `validate()` body-schema middleware — that strips
 * unknown fields and would destroy Stripe's/NowPayments' actual (much
 * richer) payloads before they got here, so each branch parses/verifies the
 * raw body itself instead.
 */
export async function handleWebhook(providerName: string, req: WebhookRequest): Promise<{ ok: true }> {
  if (providerName === 'mock') {
    const payload = req.body as { providerRef?: string; status?: string };
    if (!payload?.providerRef) throw badRequest('Missing providerRef');
    if (payload.status !== 'confirmed') return { ok: true };
    await confirmByProviderRef('mock', payload.providerRef);
    return { ok: true };
  }

  const provider = getPaymentProviderByName(providerName);
  if (!provider) throw badRequest('Unknown payment provider');

  if (providerName === 'stripe') {
    if (!env.STRIPE_WEBHOOK_SECRET) throw badRequest('Stripe webhooks are not configured');
    const signature = req.header('stripe-signature');
    if (!req.rawBody || !verifyStripeSignature(req.rawBody, signature, env.STRIPE_WEBHOOK_SECRET)) {
      throw badRequest('Invalid Stripe signature');
    }
    const event = parseStripeEvent(req.body);
    if (!event || !event.paid) return { ok: true };
    await confirmByProviderRef('stripe', event.providerRef);
    return { ok: true };
  }

  if (providerName === 'nowpayments') {
    if (!env.NOWPAYMENTS_IPN_SECRET) throw badRequest('NowPayments webhooks are not configured');
    const signature = req.header('x-nowpayments-sig');
    if (!verifyNowPaymentsSignature(req.body, signature, env.NOWPAYMENTS_IPN_SECRET)) {
      throw badRequest('Invalid NowPayments signature');
    }
    const event = parseNowPaymentsEvent(req.body);
    if (!event || !event.paid) return { ok: true };
    await confirmByProviderRef('nowpayments', event.providerRef);
    return { ok: true };
  }

  if (providerName === 'korapay') {
    if (!env.KORAPAY_SECRET_KEY) throw badRequest('Korapay webhooks are not configured');
    const body = req.body as { data?: unknown };
    const signature = req.header('x-korapay-signature');
    if (!verifyKorapaySignature(body?.data, signature, env.KORAPAY_SECRET_KEY)) {
      throw badRequest('Invalid Korapay signature');
    }
    const event = parseKorapayEvent(req.body);
    if (!event || !event.paid) return { ok: true };
    await confirmByProviderRef('korapay', event.providerRef);
    return { ok: true };
  }

  if (providerName === 'cryptomus') {
    if (!env.CRYPTOMUS_API_KEY) throw badRequest('Cryptomus webhooks are not configured');
    const event = verifyAndParseCryptomusEvent(req.body, env.CRYPTOMUS_API_KEY);
    if (!event) throw badRequest('Invalid Cryptomus signature');
    if (!event.paid) return { ok: true };
    await confirmByProviderRef('cryptomus', event.providerRef);
    return { ok: true };
  }

  throw badRequest('Unknown payment provider');
}
