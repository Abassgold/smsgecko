import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeAdmin, makeCatalog, makeProvider, makeUser } from './factories.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { Order } from '../models/Order.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { getSettings } from '../lib/settings.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(async () => {
  // express app needs no teardown
});

const get = (url: string, cookie: string) => inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string, payload?: object) =>
  inject({ method: 'POST', url, headers: { cookie }, payload });
const patch = (url: string, cookie: string, payload: object) =>
  inject({ method: 'PATCH', url, headers: { cookie }, payload });

describe('admin panel', () => {
  it('is gated to admins', async () => {
    const { cookie: userCookie } = await makeUser(app);
    expect((await get('/api/v1/admin/overview', userCookie)).statusCode).toBe(403);
    expect((await get('/api/v1/admin/overview', '')).statusCode).toBe(401);

    const { cookie: adminCookie } = await makeAdmin(app);
    expect((await get('/api/v1/admin/overview', adminCookie)).statusCode).toBe(200);
  });

  it('creates, reorders, tests and deletes providers', async () => {
    const { cookie } = await makeAdmin(app);

    const created = await post('/api/v1/admin/providers', cookie, {
      key: 'custom_http',
      label: 'Reseller X',
      enabled: true,
      priority: 5,
      config: { baseUrl: '', apiKey: 'sk_secret_1234' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().config.apiKey).toBe('••••1234'); // masked
    const newId = created.json().id as string;

    const list = await get('/api/v1/admin/providers', cookie);
    const labels = list.json().map((p: { label: string }) => p.label);
    expect(labels).toContain('Mock SIM bank'); // seeded by test setup
    expect(labels).toContain('Reseller X');

    const mockId = list.json().find((p: { label: string }) => p.label === 'Mock SIM bank').id;
    const reordered = await post('/api/v1/admin/providers/reorder', cookie, {
      orderedIds: [newId, mockId],
    });
    expect(reordered.json()[0].label).toBe('Reseller X');
    expect(reordered.json()[0].priority).toBe(0);

    const test = await post(`/api/v1/admin/providers/${newId}/test`, cookie);
    expect(test.statusCode).toBe(200);
    expect(test.json().ok).toBe(false); // no baseUrl

    expect((await inject({ method: 'DELETE', url: `/api/v1/admin/providers/${newId}`, headers: { cookie } })).statusCode).toBe(200);
  });

  it('renting falls through a broken provider to the mock', async () => {
    await makeProvider({ key: 'custom_http', label: 'Broken', enabled: true, priority: -1, config: {} });
    const { service, country } = await makeCatalog({ priceMicro: 100_000, stock: 5 });
    const { cookie } = await makeUser(app, { balanceMicro: 1_000_000 });

    const res = await post('/api/v1/orders', cookie, {
      serviceId: service.id,
      countryId: country.id,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('waiting');

    const broken = await ProviderConfig.findOne({ label: 'Broken' });
    const mock = await ProviderConfig.findOne({ label: 'Mock SIM bank' });
    expect(broken!.stats!.rentError).toBe(1);
    expect(mock!.stats!.rentSuccess).toBe(1);
  });

  it('fails with no working provider and refunds nothing', async () => {
    await ProviderConfig.updateMany({}, { $set: { enabled: false } });
    await makeProvider({ key: 'custom_http', label: 'OnlyBroken', enabled: true, priority: 0, config: {} });
    const { service, country } = await makeCatalog({ priceMicro: 100_000, stock: 5 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });

    const res = await post('/api/v1/orders', cookie, {
      serviceId: service.id,
      countryId: country.id,
    });
    expect(res.statusCode).toBe(409);
    expect((await User.findById(userId))!.balanceMicro).toBe(1_000_000);
    expect(await Order.countDocuments({ userId })).toBe(0);
  });

  it('adjusts a user balance and writes an adjustment transaction', async () => {
    const { cookie } = await makeAdmin(app);
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });

    const res = await post(`/api/v1/admin/users/${userId}/adjust-balance`, cookie, {
      amountMicro: 500_000,
      reason: 'goodwill credit',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().balanceMicro).toBe(2_500_000);

    const tx = await Transaction.findOne({ userId, type: 'adjustment' });
    expect(tx!.amountMicro).toBe(500_000);
    expect(tx!.description).toContain('goodwill credit');
  });

  it('suspends a user and blocks their login', async () => {
    const { cookie: adminCookie } = await makeAdmin(app);
    const { userId, email } = await makeUser(app);

    const res = await patch(`/api/v1/admin/users/${userId}`, adminCookie, { status: 'suspended' });
    expect(res.json().status).toBe('suspended');

    const login = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: email, password: 'supersecret1' },
    });
    expect(login.statusCode).toBe(403);
  });

  it('force-cancels a waiting order (refund)', async () => {
    const { cookie: adminCookie } = await makeAdmin(app);
    const { service, country } = await makeCatalog({ priceMicro: 300_000, stock: 5 });
    const { cookie, userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const order = (await post('/api/v1/orders', cookie, { serviceId: service.id, countryId: country.id })).json();

    const res = await post(`/api/v1/admin/orders/${order.id}/cancel`, adminCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('canceled');
    expect((await User.findById(userId))!.balanceMicro).toBe(1_000_000);
  });

  it('patches settings and getSettings() reflects it', async () => {
    const { cookie } = await makeAdmin(app);
    const res = await patch('/api/v1/admin/settings', cookie, {
      orderTtlSeconds: 45,
      mockSmsSuccessRate: 0,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().orderTtlSeconds).toBe(45);
    const live = await getSettings();
    expect(live.orderTtlSeconds).toBe(45);
    expect(live.mockSmsSuccessRate).toBe(0);
  });

  it('creates and bulk-updates catalog offers', async () => {
    const { cookie } = await makeAdmin(app);
    const svc = await post('/api/v1/admin/catalog/services', cookie, {
      slug: `admin-svc-${Date.now()}`,
      name: 'Admin Svc',
      iconKey: 'whatsapp',
    });
    expect(svc.statusCode).toBe(201);
    const ctry = await post('/api/v1/admin/catalog/countries', cookie, {
      code: 'zz',
      name: 'Testland',
      dialCode: '999',
      flagEmoji: '🏳️',
    });
    expect(ctry.statusCode).toBe(201);

    const offer = await post('/api/v1/admin/catalog/offers', cookie, {
      serviceId: svc.json().id,
      countryId: ctry.json().id,
      priceMicro: 100_000,
      stock: 10,
    });
    expect(offer.statusCode).toBe(201);

    const bulk = await post('/api/v1/admin/catalog/offers/bulk', cookie, {
      serviceId: svc.json().id,
      adjustPricePct: 50,
    });
    expect(bulk.json().modified).toBe(1);

    const list = await get(`/api/v1/admin/catalog/offers?serviceId=${svc.json().id}`, cookie);
    expect(list.json().items[0].priceMicro).toBe(150_000);
  });
});
