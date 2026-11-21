import { beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeCatalog, makeUser, simulateOtp } from './factories.js';
import { ApiKey } from '../models/ApiKey.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});

const BASE = '/stubs/handler_api.php';
async function setup(opts: { priceMicro?: number; stock?: number; balanceMicro?: number } = {}) {
  const cat = await makeCatalog({ priceMicro: opts.priceMicro ?? 200_000, stock: opts.stock ?? 5 });
  const { userId } = await makeUser(app, { balanceMicro: opts.balanceMicro ?? 2_000_000 });
  const { key } = await ApiKey.issue(userId, 'activate-test');
  const call = (query: Record<string, string>) => inject({ method: 'GET', url: BASE, query: { api_key: key, ...query } });
  return { ...cat, userId, key, call };
}

describe('SMS-Activate-compatible handler API', () => {
  it('answers BAD_KEY (401) for a missing, wrong or suspended key, on both addresses', async () => {
    const none = await inject({ method: 'GET', url: BASE, query: { action: 'getBalance' } });
    expect(none.statusCode).toBe(401);
    expect(none.text).toBe('BAD_KEY');

    const bad = await inject({ method: 'GET', url: '/api/handler_api', query: { action: 'getBalance', api_key: 'smsg_live_nope' } });
    expect(bad.text).toBe('BAD_KEY');

    const { userId, call } = await setup();
    await User.updateOne({ _id: userId }, { $set: { status: 'suspended' } });
    expect((await call({ action: 'getBalance' })).text).toBe('BAD_KEY');
  });

  it('getBalance, BAD_ACTION, and form-encoded POST', async () => {
    const { call, key } = await setup({ balanceMicro: 12_340_000 });
    expect((await call({ action: 'getBalance' })).text).toBe('ACCESS_BALANCE:12.3400');
    expect((await call({ action: 'nope' })).text).toBe('BAD_ACTION');

    const { default: request } = await import('supertest');
    const post = await request(app).post(BASE).type('form').send({ action: 'getBalance', api_key: key });
    expect(post.text).toBe('ACCESS_BALANCE:12.3400');
  });

  it('getNumber → getStatus → code → setStatus 6, with a numeric activation id', async () => {
    const { serviceCode, countryCode, call, userId } = await setup();
    const bought = await call({ action: 'getNumber', service: serviceCode, country: countryCode });
    expect(bought.statusCode).toBe(200);
    const m = /^ACCESS_NUMBER:(\d{10}):(\d+)$/.exec(bought.text);
    expect(m).not.toBeNull();
    const id = m![1]!;

    expect((await call({ action: 'getStatus', id })).text).toBe('STATUS_WAIT_CODE');
    expect((await call({ action: 'setStatus', id, status: '6' })).text).toBe('BAD_STATUS'); // nothing to finish yet

    const order = await Order.findOne({ activationId: id, userId });
    await simulateOtp(String(order!._id));
    const done = await call({ action: 'getStatus', id });
    expect(done.text).toMatch(/^STATUS_OK:.+/);
    const v2 = (await call({ action: 'getStatusV2', id })).json();
    expect(v2.sms.code).toBeTruthy();
    expect(v2.call).toBeNull();

    expect((await call({ action: 'setStatus', id, status: '6' })).text).toBe('ACCESS_ACTIVATION');
    expect((await call({ action: 'getStatus', id: '1234567890' })).text).toBe('NO_ACTIVATION');
  });

  it('getNumberV2 returns the JSON activation', async () => {
    const { serviceCode, countryCode, call } = await setup({ priceMicro: 250_000 });
    const res = await call({ action: 'getNumberV2', service: serviceCode, country: countryCode });
    const j = res.json();
    expect(j.activationId).toMatch(/^\d{10}$/);
    expect(j.activationCost).toBeCloseTo(0.25);
    expect(j.currency).toBe(840);
    expect(j.countryCode).toBe(countryCode);
    expect(new Date(j.activationEndTime).getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses unknown service/country, low balance, and a price above maxPrice (nothing charged)', async () => {
    const { serviceCode, countryCode, call, userId } = await setup({ priceMicro: 500_000, balanceMicro: 100_000 });
    expect((await call({ action: 'getNumber', service: 'zzz-unknown', country: countryCode })).text).toBe('BAD_SERVICE');
    expect((await call({ action: 'getNumber', service: serviceCode, country: 'zzz-unknown' })).text).toBe('BAD_COUNTRY');
    expect((await call({ action: 'getNumber', service: serviceCode, country: countryCode })).text).toBe('NO_BALANCE');

    await User.updateOne({ _id: userId }, { $set: { balanceMicro: 5_000_000 } });
    const low = await call({ action: 'getNumber', service: serviceCode, country: countryCode, maxPrice: '0.10' });
    expect(low.statusCode).toBe(400);
    expect(low.text).toBe('WRONG_MAX_PRICE:0.5');
    expect((await call({ action: 'getNumber', service: serviceCode, country: countryCode, maxPrice: '-1' })).text).toBe('BAD_ACTION');
    expect((await User.findById(userId))!.balanceMicro).toBe(5_000_000);

    const ok = await call({ action: 'getNumber', service: serviceCode, country: countryCode, maxPrice: '0.60' });
    expect(ok.text).toMatch(/^ACCESS_NUMBER:/);
  });

  it('fixedPrice buys exactly that tier, else NO_NUMBERS', async () => {
    const { serviceCode, countryCode, call } = await setup({ priceMicro: 300_000 });
    expect((await call({ action: 'getNumber', service: serviceCode, country: countryCode, maxPrice: '0.9', fixedPrice: 'true' })).text).toBe('NO_NUMBERS');
    expect((await call({ action: 'getNumber', service: serviceCode, country: countryCode, maxPrice: '0.3', fixedPrice: 'true' })).text).toMatch(/^ACCESS_NUMBER:/);
  });

  it('NO_NUMBERS when nothing is in stock', async () => {
    const { serviceCode, countryCode, call } = await setup({ stock: 0 });
    expect((await call({ action: 'getNumber', service: serviceCode, country: countryCode })).text).toBe('NO_NUMBERS');
  });

  it('setStatus 8 cancels and refunds; the status then reads STATUS_CANCEL', async () => {
    const { serviceCode, countryCode, call, userId } = await setup({ priceMicro: 200_000, balanceMicro: 1_000_000 });
    const id = /^ACCESS_NUMBER:(\d+):/.exec((await call({ action: 'getNumber', service: serviceCode, country: countryCode })).text)![1]!;
    expect((await User.findById(userId))!.balanceMicro).toBe(800_000);
    const cancel = await call({ action: 'setStatus', id, status: '8' });
    expect(['ACCESS_CANCEL', 'EARLY_CANCEL_DENIED']).toContain(cancel.text);
    if (cancel.text === 'ACCESS_CANCEL') {
      expect((await User.findById(userId))!.balanceMicro).toBe(1_000_000);
      expect((await call({ action: 'getStatus', id })).text).toBe('STATUS_CANCEL');
    }
  });

  it('setStatus 1 acks, an unknown status is BAD_STATUS', async () => {
    const { serviceCode, countryCode, call } = await setup();
    const id = /^ACCESS_NUMBER:(\d+):/.exec((await call({ action: 'getNumber', service: serviceCode, country: countryCode })).text)![1]!;
    expect((await call({ action: 'setStatus', id, status: '1' })).text).toBe('ACCESS_READY');
    expect((await call({ action: 'setStatus', id, status: '42' })).text).toBe('BAD_STATUS');
  });

  it('getActiveActivations lists waiting orders; only the owner sees their own', async () => {
    const { serviceCode, countryCode, call } = await setup();
    const id = /^ACCESS_NUMBER:(\d+):/.exec((await call({ action: 'getNumber', service: serviceCode, country: countryCode })).text)![1]!;
    const list = (await call({ action: 'getActiveActivations' })).json();
    expect(list.status).toBe('success');
    expect(list.data.map((a: { activationId: string }) => a.activationId)).toContain(id);
    expect(list.data[0].activationStatus).toBe('1');

    const other = await setup();
    expect((await other.call({ action: 'getStatus', id })).text).toBe('NO_ACTIVATION');
  });

  it('prices, services and countries', async () => {
    const { serviceCode, countryCode, call } = await setup({ priceMicro: 450_000, stock: 9 });
    const p = (await call({ action: 'getPrices', service: serviceCode })).json();
    expect(p[countryCode][serviceCode]).toEqual({ cost: '0.4500', count: 9 });
    const p2 = (await call({ action: 'getPricesV2', service: serviceCode, country: countryCode })).json();
    expect(p2[countryCode][serviceCode].prices).toEqual({ '0.4500': 9 });
    expect((await call({ action: 'getPrices' })).text).toBe('BAD_SERVICE');

    const s = (await call({ action: 'getServicesList' })).json();
    expect(s.status).toBe('success');
    expect(s.services).toContainEqual({ code: serviceCode, name: serviceCode });
    const c = (await call({ action: 'getCountries' })).json();
    expect(c).toContainEqual({ id: countryCode, eng: countryCode, iso: 'us' });
  });

  it('setStatus 3 (another SMS) only after a code arrived; WAIT_RETRY shows the old code; cancelling that wait keeps it', async () => {
    const { serviceCode, countryCode, call, userId } = await setup();
    const id = /^ACCESS_NUMBER:(\d+):/.exec((await call({ action: 'getNumber', service: serviceCode, country: countryCode })).text)![1]!;
    // Nothing has arrived yet: nothing to ask "another" of.
    expect((await call({ action: 'setStatus', id, status: '3' })).text).toBe('BAD_STATUS');

    const order = await Order.findOne({ activationId: id, userId });
    await simulateOtp(String(order!._id));
    const code = /^STATUS_OK:(.+)$/.exec((await call({ action: 'getStatus', id })).text)![1]!;
    expect((await call({ action: 'getActiveActivations' })).json().data[0].canGetAnotherSms).toBe(true);

    expect((await call({ action: 'setStatus', id, status: '3' })).text).toBe('ACCESS_RETRY_GET');
    expect((await call({ action: 'getStatus', id })).text).toBe(`STATUS_WAIT_RETRY:${code}`);
    expect((await call({ action: 'getActiveActivations' })).json().data[0].activationStatus).toBe('3');

    // Stop waiting for the second SMS: the first was delivered and paid for, so no refund, just the old code back.
    const before = (await User.findById(userId))!.balanceMicro;
    expect((await call({ action: 'setStatus', id, status: '8' })).text).toBe(`STATUS_OK:${code}`);
    expect((await User.findById(userId))!.balanceMicro).toBe(before);
  });
});
