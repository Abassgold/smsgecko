import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeUser } from './factories.js';
import { env } from '../config/env.js';
import { Deposit } from '../models/Deposit.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { signPostbackToken } from '../providers/payment/trybit.js';

/*
 * Trybit hosted crypto checkout. Nothing here reaches the real Trybit: every call goes to a mocked fetch.
 * The money rules under test (ported from Mane SMS): a postback only proves Trybit called, the invoice is read back from
 * Trybit, and what is credited is what ARRIVED (received_usd), once, in one transaction.
 */
let app: Application;
let inject: ReturnType<typeof makeInject>;
const fetchMock = vi.fn();
const SECRET = 'test-trybit-secret';

beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  env.TRYBIT_API_KEY = 'test-tb-key'; // fake credentials: every call below goes to the mocked fetch
  env.TRYBIT_SHOP_ID = 'shop-1';
  env.TRYBIT_SECRET_KEY = SECRET;
  env.TRYBIT_BASE_URL = 'http://trybit.test';
});
afterEach(() => {
  env.TRYBIT_API_KEY = undefined;
  env.TRYBIT_SHOP_ID = undefined;
  env.TRYBIT_SECRET_KEY = undefined;
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const created = (uuid = 'INV-89UX09KA') => fetchMock.mockResolvedValueOnce(json({ status: 'success', result: { uuid, status: 'created', link: `https://pay.trybit.test/${uuid.slice(4)}` } }));
const balanceOf = async (userId: string) => (await User.findById(userId))!.balanceMicro;

/** Start a top-up and return what Trybit would later report about that invoice. */
async function topUp(amountUsd = 10) {
  const { cookie, userId } = await makeUser(app);
  created();
  const res = await inject({ method: 'POST', url: '/api/v1/deposits', headers: { cookie }, payload: { method: 'trybit', amountMicro: amountUsd * 1_000_000 } });
  expect(res.statusCode).toBe(201);
  const depositId = res.json().id as string;
  const invoice = (over: Record<string, unknown> = {}) => ({
    uuid: 'INV-89UX09KA',
    status: 'paid',
    order_id: 'dep_x',
    amount_usd: amountUsd,
    received_usd: amountUsd,
    amount: 0.0034,
    currency: 'ETH',
    test_mode: false,
    ...over,
  });
  /** Trybit answers the invoice lookup the postback (or the page) triggers. */
  const reports = (over: Record<string, unknown> = {}) => fetchMock.mockResolvedValueOnce(json({ status: 'success', result: [invoice(over)] }));
  return { cookie, userId, depositId, res, reports };
}

const postback = (payload: object = {}, token: string = signPostbackToken({ exp: Math.floor(Date.now() / 1000) + 300 }, SECRET)) =>
  inject({ method: 'POST', url: '/api/v1/webhooks/payments/trybit', payload: { status: 'success', invoice_id: '89UX09KA', token, ...payload } });

describe('starting a Trybit top-up', () => {
  it('creates a pending deposit and a hosted checkout, and does not touch the balance', async () => {
    const t = await topUp(12.5);
    expect(t.res.json()).toMatchObject({ amountMicro: 12_500_000, status: 'pending', method: 'trybit', payUrl: 'https://pay.trybit.test/89UX09KA' });
    expect(await balanceOf(t.userId)).toBe(0);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://trybit.test/v2/invoice/create');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Token test-tb-key' });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ shop_id: 'shop-1', amount: 12.5, currency: 'USD' });
    expect(await Deposit.findById(t.depositId)).toMatchObject({ providerRef: 'INV-89UX09KA', method: 'trybit', provider: 'trybit' });
  });

  it('is not offered when Trybit is not configured', async () => {
    env.TRYBIT_API_KEY = undefined;
    const { cookie } = await makeUser(app);
    const res = await inject({ method: 'POST', url: '/api/v1/deposits', headers: { cookie }, payload: { method: 'trybit', amountMicro: 5_000_000 } });
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('when Trybit refuses: a clean error, no deposit left behind, nothing credited, Trybit\'s own words not shown', async () => {
    const { cookie, userId } = await makeUser(app);
    fetchMock.mockResolvedValueOnce(json({ status: 'error', result: { authorization: 'Unauthorized request.' } }, 401));
    const res = await inject({ method: 'POST', url: '/api/v1/deposits', headers: { cookie }, payload: { method: 'trybit', amountMicro: 10_000_000 } });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).not.toMatch(/Unauthorized/i);
    expect(await Deposit.countDocuments({ userId })).toBe(0);
    expect(await balanceOf(userId)).toBe(0);
  });
});

describe('Trybit postbacks', () => {
  it('a paid invoice credits the balance once, with a ledger entry', async () => {
    const t = await topUp(10);
    t.reports();
    const r = await postback();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, result: 'credited' });
    expect(await balanceOf(t.userId)).toBe(10_000_000);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'confirmed', providerStatus: 'paid' });
    expect(await Transaction.findOne({ userId: t.userId, type: 'deposit' })).toMatchObject({ amountMicro: 10_000_000, balanceBeforeMicro: 0, balanceAfterMicro: 10_000_000 });

    // The invoice is read back from Trybit, with our key, by its id.
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe('http://trybit.test/v2/invoice/merchant/info');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ uuids: ['INV-89UX09KA'] });
  });

  it('a replayed postback does not credit twice', async () => {
    const t = await topUp(10);
    t.reports();
    await postback();
    t.reports();
    const again = await postback();
    expect(again.json().result).toBe('updated');
    expect(await balanceOf(t.userId)).toBe(10_000_000);
    expect(await Transaction.countDocuments({ userId: t.userId, type: 'deposit' })).toBe(1);
  });

  it('an overpaid invoice credits what actually arrived, and replays do not credit twice', async () => {
    const t = await topUp(10);
    t.reports({ status: 'overpaid', received_usd: 12.34 });
    expect((await postback()).json().result).toBe('credited');
    expect(await balanceOf(t.userId)).toBe(12_340_000);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'confirmed', paidMicro: 12_340_000 });
    expect((await inject({ method: 'GET', url: `/api/v1/deposits/${t.depositId}`, headers: { cookie: t.cookie } })).json().amountMicro).toBe(12_340_000); // shows what was credited
    t.reports({ status: 'overpaid', received_usd: 12.34 });
    expect((await postback()).json().result).toBe('updated');
    expect(await balanceOf(t.userId)).toBe(12_340_000);
    expect(await Transaction.countDocuments({ userId: t.userId, type: 'deposit' })).toBe(1);
  });

  it("a 'paid' invoice that arrived worth less than its value credits what was received (a $5 invoice paid in TRX arrived as $2)", async () => {
    const t = await topUp(5);
    t.reports({ status: 'paid', received_usd: 2, currency: 'TRX', tx_list: ['5085abc'] });
    expect((await postback()).json().result).toBe('credited');
    expect(await balanceOf(t.userId)).toBe(2_000_000);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'confirmed', paidMicro: 2_000_000, receivedMicro: 2_000_000, txId: '5085abc' });
    t.reports({ status: 'paid', received_usd: 2 });
    expect((await postback()).json().result).toBe('updated');
    expect(await balanceOf(t.userId)).toBe(2_000_000);
  });

  it('a customer who paid the fee on top (received equals the invoice) is credited the invoice', async () => {
    const t = await topUp(5);
    t.reports({ status: 'paid', received_usd: 5, currency: 'USDT_TRC20', amount: 5.09 });
    expect((await postback()).json().result).toBe('credited');
    expect(await balanceOf(t.userId)).toBe(5_000_000);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ receivedMicro: 5_000_000 });
  });

  it('a paid report without a received value credits nothing and stays pending until Trybit gives it', async () => {
    const t = await topUp(5);
    t.reports({ status: 'paid', received_usd: null });
    expect((await postback()).json().result).toBe('updated');
    expect(await balanceOf(t.userId)).toBe(0);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'pending' });
    t.reports({ status: 'paid', received_usd: 5 });
    expect((await postback()).json().result).toBe('credited');
    expect(await balanceOf(t.userId)).toBe(5_000_000);
  });

  it("a 'paid' invoice that received nothing is not credited and stays pending for an admin", async () => {
    const t = await topUp(5);
    t.reports({ status: 'paid', received_usd: 0 });
    expect((await postback()).json().result).toBe('updated');
    expect(await balanceOf(t.userId)).toBe(0);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'pending', receivedMicro: 0 });
  });

  it('an overpayment above twice the invoice credits only the invoice value, and records everything that arrived', async () => {
    const t = await topUp(10);
    t.reports({ status: 'overpaid', received_usd: 25 });
    expect((await postback()).json().result).toBe('credited');
    expect(await balanceOf(t.userId)).toBe(10_000_000);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ receivedMicro: 25_000_000 });
  });

  it('an overpaid report with no received_usd credits nothing (the invoice value is never assumed)', async () => {
    const t = await topUp(10);
    t.reports({ status: 'overpaid', received_usd: null });
    expect((await postback()).json().result).toBe('updated');
    expect(await balanceOf(t.userId)).toBe(0);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'pending' });
  });

  it('a partial payment records what Trybit says arrived, and credits once more than $1 has arrived', async () => {
    const t = await topUp(10);
    t.reports({ status: 'partial', received_usd: 0.5, tx_list: ['abc123'] });
    expect((await postback()).json().result).toBe('partial');
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'partial', receivedMicro: 500_000, txId: 'abc123' });
    t.reports({ status: 'partial', received_usd: 4 });
    expect((await postback()).json().result).toBe('credited');
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'confirmed', paidMicro: 4_000_000, receivedMicro: 4_000_000 });
    expect(await balanceOf(t.userId)).toBe(4_000_000);
  });

  it('a partial invoice of $1 or less waits, and credits in full if the customer then pays the rest', async () => {
    const t = await topUp(10);
    t.reports({ status: 'partial', received_usd: 1 });
    expect((await postback()).json().result).toBe('partial');
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'partial', paidMicro: 1_000_000 });
    expect(await balanceOf(t.userId)).toBe(0);

    t.reports({ status: 'paid' });
    expect((await postback()).json().result).toBe('credited');
    expect(await balanceOf(t.userId)).toBe(10_000_000);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'confirmed' });
  });

  it('a partial invoice above $1 credits what was received, once', async () => {
    const t = await topUp(10);
    t.reports({ status: 'partial', received_usd: 4 });
    expect((await postback()).json().result).toBe('credited');
    t.reports({ status: 'partial', received_usd: 4 });
    expect((await postback()).json().result).toBe('updated');
    expect(await balanceOf(t.userId)).toBe(4_000_000);
    expect(await Transaction.countDocuments({ userId: t.userId, type: 'deposit' })).toBe(1);
  });

  it('refuses a wrong-secret token, an expired token, an unsigned token, an empty token and a missing token, and credits nothing', async () => {
    const t = await topUp(10);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(`{"exp":${now + 300}}`).toString('base64url')}.`;
    for (const token of [signPostbackToken({ exp: now + 300 }, 'wrong-secret'), signPostbackToken({ exp: now - 600 }, SECRET), unsigned, '']) {
      expect((await postback({}, token)).statusCode).toBe(400);
    }
    expect((await inject({ method: 'POST', url: '/api/v1/webhooks/payments/trybit', payload: { status: 'success', invoice_id: '89UX09KA' } })).statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the invoice creation; Trybit is never asked about a forged postback
    expect(await balanceOf(t.userId)).toBe(0);
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'pending' });
  });

  it('is refused when no secret key is configured, so no postback is ever trusted', async () => {
    const t = await topUp(10);
    env.TRYBIT_SECRET_KEY = undefined;
    expect((await postback()).statusCode).toBe(400);
    expect(await balanceOf(t.userId)).toBe(0);
  });

  it('ignores an invoice whose amount is not what we asked for', async () => {
    const t = await topUp(10);
    t.reports({ amount_usd: 1 });
    expect((await postback()).json().result).toBe('ignored');
    expect(await balanceOf(t.userId)).toBe(0);
  });

  it('ignores an invoice that is not the one we created', async () => {
    const t = await topUp(10);
    t.reports({ uuid: 'INV-OTHER000' });
    expect((await postback({ invoice_id: 'OTHER000' })).json().result).toBe('ignored');
    expect(await balanceOf(t.userId)).toBe(0);
  });

  it('never credits a test-mode invoice in production', async () => {
    const t = await topUp(10);
    t.reports({ test_mode: true });
    const mode = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      expect((await postback()).json().result).toBe('ignored');
    } finally {
      env.NODE_ENV = mode;
    }
    expect(await balanceOf(t.userId)).toBe(0);
    t.reports({ test_mode: true });
    expect((await postback()).json().result).toBe('credited'); // fine in development
  });

  it('a canceled (expired) invoice marks the deposit failed', async () => {
    const t = await topUp(10);
    t.reports({ status: 'canceled', received_usd: 0 });
    expect((await postback()).json().result).toBe('failed');
    expect(await Deposit.findById(t.depositId)).toMatchObject({ status: 'failed' });
    expect(await balanceOf(t.userId)).toBe(0);
  });

  it('answers 503 when Trybit cannot be reached, so the postback can be resent', async () => {
    await topUp(10);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect((await postback()).statusCode).toBe(503);
  });

  it('answers 400 when the postback names no invoice', async () => {
    await topUp(10);
    expect((await postback({ invoice_id: '' })).statusCode).toBe(400);
  });

  it('two postbacks arriving at the same moment credit once', async () => {
    const t = await topUp(10);
    t.reports();
    t.reports();
    const [a, b] = await Promise.all([postback(), postback()]);
    expect([a.json().result, b.json().result].sort()).toEqual(['credited', 'updated']);
    expect(await balanceOf(t.userId)).toBe(10_000_000);
    expect(await Transaction.countDocuments({ userId: t.userId, type: 'deposit' })).toBe(1);
  });
});

describe('when the postback never arrives', () => {
  it("the customer's deposit page asks Trybit and credits a paid invoice", async () => {
    const t = await topUp(10);
    t.reports();
    const r = await inject({ method: 'GET', url: `/api/v1/deposits/${t.depositId}`, headers: { cookie: t.cookie } });
    expect(r.json()).toMatchObject({ status: 'confirmed' });
    expect(await balanceOf(t.userId)).toBe(10_000_000);
  });

  it('asking is throttled, so a page that keeps polling does not hammer Trybit', async () => {
    const t = await topUp(10);
    t.reports({ status: 'created', received_usd: 0 });
    await inject({ method: 'GET', url: `/api/v1/deposits/${t.depositId}`, headers: { cookie: t.cookie } });
    await inject({ method: 'GET', url: `/api/v1/deposits/${t.depositId}`, headers: { cookie: t.cookie } });
    await inject({ method: 'GET', url: `/api/v1/deposits/${t.depositId}`, headers: { cookie: t.cookie } });
    expect(fetchMock).toHaveBeenCalledTimes(2); // the invoice creation + ONE lookup
  });
});
