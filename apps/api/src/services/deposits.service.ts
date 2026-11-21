import type { CreateDepositBody, DepositStatus } from '@smsgecko/shared';
import { DEPOSIT_STATUSES, MICRO_PER_USD, formatUsd } from '@smsgecko/shared';
import mongoose, { type Types } from 'mongoose';
import { Deposit, type DepositDoc } from '../models/Deposit.js';
import type { UserDoc } from '../models/User.js';
import { getPaymentProvider, getPaymentProviderByName } from '../providers/payment/index.js';
import { verifyStripeSignature, parseStripeEvent } from '../providers/payment/stripe.js';
import { verifyNowPaymentsSignature, parseNowPaymentsEvent } from '../providers/payment/nowpayments.js';
import { verifyBachsSignature, parseBachsEvent } from '../providers/payment/bachs.js';
import { verifyAndParseCryptomusEvent } from '../providers/payment/cryptomus.js';
import * as tb from '../providers/payment/trybit.js';
import { logger } from '../lib/logger.js';
import { notify } from '../models/Notification.js';
import { credit } from '../lib/ledger.js';
import { getSettings } from '../lib/settings.js';
import { env } from '../config/env.js';
import { badRequest, conflict, notFound, serviceUnavailable } from '../lib/errors.js';

export function toDepositView(d: DepositDoc) {
  return {
    id: d.id as string,
    method: d.method,
    // A confirmed short or over payment shows what was actually credited, not the invoice total.
    amountMicro: d.status === 'confirmed' && d.paidMicro != null ? d.paidMicro : d.amountMicro,
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
  /** 'all' (default) or a single status to filter the page by. */
  status?: DepositStatus | 'all';
}

export type DepositStatusCounts = Record<DepositStatus, number> & { all: number };

export async function listDeposits(user: UserDoc, params: ListDepositsParams) {
  const filter: Record<string, unknown> = { userId: user._id };
  if (params.status && params.status !== 'all') filter.status = params.status;

  const [items, total, countRows] = await Promise.all([
    Deposit.find(filter)
      .sort({ createdAt: -1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit),
    Deposit.countDocuments(filter),
    // Unfiltered by status — the tab counts stay stable regardless of which
    // tab is currently selected.
    Deposit.aggregate<{ _id: DepositStatus; count: number }>([
      { $match: { userId: user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = DEPOSIT_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    { all: 0 } as DepositStatusCounts,
  );
  for (const row of countRows) {
    counts[row._id] = row.count;
    counts.all += row.count;
  }

  return {
    items: items.map(toDepositView),
    total,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
    counts,
  };
}

export async function getDeposit(user: UserDoc, id: string): Promise<DepositDoc> {
  const deposit = await Deposit.findOne({ _id: id, userId: user._id });
  if (!deposit) throw notFound('Deposit not found');
  // A Trybit payment can be confirmed by asking Trybit, in case its notification was lost (or cannot reach us in development).
  return (await reconcileTrybit(deposit)) ?? deposit;
}

/**
 * Confirm a pending deposit and credit the wallet. Guarded so it can only
 * ever settle once. Called from the payment webhook once a provider
 * confirms funds actually landed.
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
export async function handleWebhook(providerName: string, req: WebhookRequest): Promise<{ ok: true; result?: ApplyResult }> {
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

  if (providerName === 'bachs') {
    if (!env.BACHS_WEBHOOK_SECRET) throw badRequest('Bachs webhooks are not configured');
    const signature = req.header('x-bachs-signature-v2');
    if (!req.rawBody || !verifyBachsSignature(req.rawBody, signature, env.BACHS_WEBHOOK_SECRET)) {
      throw badRequest('Invalid Bachs signature');
    }
    const event = parseBachsEvent(req.body);
    if (!event || !event.paid) return { ok: true };
    await confirmByProviderRef('bachs', event.providerRef);
    return { ok: true };
  }

  if (providerName === 'trybit') {
    if (!env.TRYBIT_SECRET_KEY || !tb.trybitEnabled()) throw badRequest('Trybit webhooks are not configured');
    const body = (req.body ?? {}) as { token?: unknown; invoice_id?: unknown };
    if (!tb.verifyPostbackToken(body.token)) {
      logger.warn('[payments] Trybit postback with a bad or expired token');
      throw badRequest('Invalid Trybit token');
    }
    const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id.trim() : '';
    if (!/^(INV-)?[A-Z0-9]{4,32}$/i.test(invoiceId)) throw badRequest('Missing invoice_id');
    try {
      // The postback only proves Trybit called. What the invoice says now is read back from Trybit itself.
      return { ok: true, result: await applyTrybitInvoice(await tb.getInvoice(invoiceId)) };
    } catch (err) {
      if (err instanceof tb.TrybitError) {
        // Could not read the invoice: a non-200 lets Trybit resend the postback.
        logger.error({ err, invoiceId }, '[payments] could not read the invoice for a Trybit postback');
        throw serviceUnavailable('Try again');
      }
      throw err;
    }
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


/* ---------------- Trybit ---------------- */

const usd = (micro: number) => Number((micro / MICRO_PER_USD).toFixed(2));

/**
 * The only place a Trybit payment turns into balance. Flips the deposit to confirmed and credits it in ONE database
 * transaction, and only if it is still in one of the `from` states, so retries and replays credit exactly once and a crash
 * between the two steps cannot leave a confirmed deposit with no money.
 */
async function creditTrybitDeposit(id: Types.ObjectId, from: DepositStatus[], info: Record<string, unknown>, label: string, creditMicro: number): Promise<DepositDoc | null> {
  const session = await mongoose.startSession();
  let claimed: DepositDoc | null = null;
  try {
    await session.withTransaction(async () => {
      claimed = null;
      const flipped = await Deposit.findOneAndUpdate(
        { _id: id, status: { $in: from } },
        { $set: { status: 'confirmed', confirmedAt: new Date(), ...info } },
        { returnDocument: 'after', session },
      );
      if (!flipped) return;
      await credit(flipped.userId, creditMicro, { type: 'deposit', description: label, depositId: flipped._id, session });
      claimed = flipped;
    });
  } finally {
    await session.endSession();
  }
  if (claimed) {
    const d = claimed as DepositDoc;
    await notify(d.userId, 'deposit_confirmed', 'Deposit confirmed', `${formatUsd(creditMicro)} was added to your balance.`);
  }
  return claimed;
}

/** A partial payment above this is credited automatically (1 USD). */
const MIN_AUTO_PARTIAL_MICRO = MICRO_PER_USD;
/** An overpayment is credited in full up to this multiple of the invoice. */
const MAX_OVERPAY_FACTOR = 2;
export type ApplyResult = 'credited' | 'partial' | 'failed' | 'updated' | 'ignored';

/**
 * Act on what Trybit says an invoice is NOW. Safe to call any number of times, from a postback or from a reconcile.
 * Credits what arrived (`received_usd`, after Trybit's fees), never the invoice value.
 */
export async function applyTrybitInvoice(inv: tb.TrybitInvoice): Promise<ApplyResult> {
  const deposit = await Deposit.findOne({ provider: 'trybit', providerRef: inv.uuid });
  if (!deposit) return 'ignored';

  const priceOk = inv.amount_usd != null && Math.abs(Number(inv.amount_usd) - usd(deposit.amountMicro)) < 0.01;
  if (!priceOk) {
    logger.warn({ depositId: deposit.id, invoice: inv.uuid, amountUsd: inv.amount_usd }, '[payments] Trybit invoice does not match its deposit; ignored');
    return 'ignored';
  }
  if (inv.test_mode && env.NODE_ENV === 'production') {
    logger.warn({ depositId: deposit.id, invoice: inv.uuid }, '[payments] Trybit test-mode invoice ignored in production');
    return 'ignored';
  }

  const status = String(inv.status).toLowerCase();
  const info = { providerStatus: status };
  // What Trybit says arrived, in USD, after its own fees. Recorded for every paid, overpaid and partial report,
  // whatever we end up crediting (the credit and this value can differ).
  const receivedMicro = inv.received_usd != null && Number.isFinite(Number(inv.received_usd)) ? Math.round(Number(inv.received_usd) * MICRO_PER_USD) : null;
  const audit = { ...(receivedMicro != null ? { receivedMicro } : {}), ...(inv.tx_list?.[0] ? { txId: String(inv.tx_list[0]) } : {}) };
  const open: DepositStatus[] = ['pending', 'partial'];

  if (status === 'paid' || status === 'overpaid') {
    // Credit exactly what Trybit says arrived, never the invoice value: a coin can arrive worth less than it was quoted.
    // Without that figure we credit nothing; the deposit stays pending and is read again later.
    if (receivedMicro == null || receivedMicro <= 0) {
      logger.warn({ depositId: deposit.id, invoice: inv.uuid, received: inv.received_usd }, '[payments] Trybit reported a paid invoice without a received value; not credited yet');
      await Deposit.updateOne({ _id: deposit._id, status: { $in: open } }, { $set: { ...info, ...audit } });
      return 'updated';
    }
    // A received value above MAX_OVERPAY_FACTOR x the invoice is more likely bad data than a real payment: credit the
    // invoice value and leave the rest for an admin.
    let creditMicro = receivedMicro;
    if (receivedMicro > deposit.amountMicro * MAX_OVERPAY_FACTOR) {
      creditMicro = deposit.amountMicro;
      logger.warn({ depositId: deposit.id, invoice: inv.uuid, receivedMicro, invoiceMicro: deposit.amountMicro }, '[payments] Trybit received value above the cap; credited the invoice value, the rest needs an admin');
    }
    const note = creditMicro === deposit.amountMicro ? '' : creditMicro < deposit.amountMicro ? ', received less' : ', overpaid';
    const done = await creditTrybitDeposit(deposit._id, open, { ...info, ...audit, paidMicro: creditMicro }, `Deposit ${formatUsd(creditMicro)} via trybit${note}`, creditMicro);
    if (!done) await Deposit.updateOne({ _id: deposit._id }, { $set: { providerStatus: status } });
    return done ? 'credited' : 'updated';
  }

  if (status === 'partial') {
    const receivedUsd = Math.max(0, Math.min(Number(inv.received_usd) || 0, usd(deposit.amountMicro)));
    const paidMicro = Math.floor(receivedUsd * MICRO_PER_USD);
    // More than $1 arrived: credit what was received now. At $1 or less it waits for an admin or for the rest.
    if (paidMicro > MIN_AUTO_PARTIAL_MICRO) {
      const done = await creditTrybitDeposit(deposit._id, open, { ...info, ...audit, paidMicro }, `Deposit ${formatUsd(paidMicro)} via trybit, partial`, paidMicro);
      return done ? 'credited' : 'updated';
    }
    const res = await Deposit.updateOne({ _id: deposit._id, status: { $in: open } }, { $set: { status: 'partial', paidMicro, ...info, ...audit } });
    return res.modifiedCount ? 'partial' : 'updated';
  }

  if (status === 'canceled') {
    const res = await Deposit.updateOne({ _id: deposit._id, status: 'pending' }, { $set: { status: 'failed', ...info } });
    return res.modifiedCount ? 'failed' : 'updated';
  }

  // created: still waiting for the customer.
  await Deposit.updateOne({ _id: deposit._id }, { $set: info });
  return 'updated';
}

const lastAsked = new Map<string, number>();
const ASK_EVERY_MS = 15_000;

/**
 * Ask Trybit about an open deposit directly. A notification can be lost, and on localhost none can arrive, so the page
 * calls this while a payment is open. Throttled so polling cannot hammer the gateway. Never throws.
 */
export async function reconcileTrybit(d: DepositDoc): Promise<DepositDoc | null> {
  if (d.provider !== 'trybit' || !['pending', 'partial'].includes(d.status) || !tb.trybitEnabled()) return null;
  const key = String(d._id);
  if (Date.now() - (lastAsked.get(key) ?? 0) < ASK_EVERY_MS) return null;
  lastAsked.set(key, Date.now());
  try {
    await applyTrybitInvoice(await tb.getInvoice(d.providerRef));
  } catch (err) {
    logger.warn({ err, depositId: key }, '[payments] could not ask Trybit about the invoice');
  }
  return Deposit.findById(d._id);
}
