import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeCatalog, makeUser, simulateOtp } from './factories.js';
import { ApiKey } from '../models/ApiKey.js';
import { User } from '../models/User.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { encryptJson } from '../lib/secretbox.js';
import { bustProviderCache } from '../providers/sms/registry.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(async () => {
  // express app needs no teardown
});

async function keyFor(userId: string) {
  const { key } = await ApiKey.issue(userId, 'test');
  return key;
}

describe('v2 API (Bearer)', () => {
  it('rejects missing / bad keys', async () => {
    const noAuth = await inject({ method: 'GET', url: '/api/v2/catalog/products' });
    expect(noAuth.statusCode).toBe(401);

    const bad = await inject({
      method: 'GET',
      url: '/api/v2/catalog/products',
      headers: { authorization: 'Bearer smsg_live_nope' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('403s a valid key on a suspended account', async () => {
    const { userId } = await makeUser(app);
    const key = await keyFor(userId);
    await User.updateOne({ _id: userId }, { $set: { status: 'suspended' } });

    const res = await inject({
      method: 'GET',
      url: '/api/v2/orders/active',
      headers: { authorization: `Bearer ${key}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('404s an unknown v2 route with the same envelope', async () => {
    const { userId } = await makeUser(app);
    const key = await keyFor(userId);

    const res = await inject({
      method: 'GET',
      url: '/api/v2/nope',
      headers: { authorization: `Bearer ${key}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v2/nope not found' },
    });
  });

  it('returns the wallet balance as a decimal USD string', async () => {
    const { userId } = await makeUser(app, { balanceMicro: 1_250_000 });
    const key = await keyFor(userId);

    const res = await inject({
      method: 'GET',
      url: '/api/v2/balance',
      headers: { authorization: `Bearer ${key}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { balance: '1.25' } });
  });

  it('lists catalog products with string prices', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 500_000, stock: 7 });
    const { userId } = await makeUser(app);
    const key = await keyFor(userId);

    const res = await inject({
      method: 'GET',
      url: `/api/v2/catalog/products?service=${serviceCode}`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    const found = res
      .json()
      .data.find((p: { id: string }) => p.id === `${serviceCode}::${countryCode}`);
    expect(found.price).toBe('0.5');
    expect(found.stock).toBe(7);
  });

  it('runs create → poll → finish', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 200_000, stock: 5 });
    const productId = `${serviceCode}::${countryCode}`;
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);

    const created = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}`, 'idempotency-key': 'v2-key-abc123' },
      payload: { catalog_product_id: productId, max_price: '0.50' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().success).toBe(true);
    const orderId = created.json().data.id as string;
    expect(created.json().data.status).toBe('waiting');
    expect(created.json().data.price).toBe('0.2');

    // idempotent
    const again = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}`, 'idempotency-key': 'v2-key-abc123' },
      payload: { catalog_product_id: productId },
    });
    expect(again.json().data.id).toBe(orderId);

    await simulateOtp(orderId);

    const polled = await inject({
      method: 'GET',
      url: `/api/v2/orders/${orderId}`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(polled.json().data.status).toBe('completed');
    expect(polled.json().data.otp_code).toMatch(/^\d{4,8}$/);
    expect(polled.json().data.sms).toHaveLength(1);

    const finished = await inject({
      method: 'POST',
      url: `/api/v2/orders/${orderId}/finish`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(finished.statusCode).toBe(200);
    expect(finished.json().data.finished_at).toBeTruthy();
  });

  it('rejects max_price below the offer price', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 800_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);

    const res = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { catalog_product_id: `${serviceCode}::${countryCode}`, max_price: '0.10' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('rejects a replayed idempotency key used with a different body', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 150_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);
    const idKey = 'reuse-check-key';
    const productId = `${serviceCode}::${countryCode}`;

    const first = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}`, 'idempotency-key': idKey },
      payload: { catalog_product_id: productId },
    });
    expect(first.statusCode).toBe(201);

    // Same key, same product, but a different operator_id — the hash mismatch
    // is caught before any catalog/operator lookup, so this operator need not
    // actually exist for the check itself to be exercised.
    const replay = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}`, 'idempotency-key': idKey },
      payload: { catalog_product_id: productId, operator_id: 'a-different-carrier' },
    });
    expect(replay.statusCode).toBe(422);
    expect(replay.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects a concurrent create with the same idempotency key still in flight', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 150_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);
    const idKey = 'in-flight-key';
    const payload = { catalog_product_id: `${serviceCode}::${countryCode}` };

    const [first, second] = await Promise.all([
      inject({
        method: 'POST',
        url: '/api/v2/orders',
        headers: { authorization: `Bearer ${key}`, 'idempotency-key': idKey },
        payload,
      }),
      inject({
        method: 'POST',
        url: '/api/v2/orders',
        headers: { authorization: `Bearer ${key}`, 'idempotency-key': idKey },
        payload,
      }),
    ]);

    const codes = [first, second].map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409]);
    const losing = first.statusCode === 409 ? first : second;
    expect(losing.json().error.code).toBe('REQUEST_IN_PROGRESS');
  });

  it('reports PROVIDER_ERROR with per-attempt outcomes when every provider fails to rent', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 150_000, stock: 5 });
    // The lone 'mock' provider config makeCatalog just set up — flip it to fail
    // `rent()` while keeping the same catalog, so pricing still succeeds and
    // only the rental attempt itself fails.
    await ProviderConfig.updateOne(
      { key: 'mock' },
      {
        $set: {
          configEnc: encryptJson({
            catalogPriceMicro: 150_000,
            catalogStock: 5,
            catalogServices: [{ code: serviceCode, name: serviceCode }],
            catalogCountries: [{ code: countryCode, name: countryCode, iso2: 'us', dialCode: '1' }],
            failRent: true,
          }),
        },
      },
    );
    bustProviderCache();
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);

    const res = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { catalog_product_id: `${serviceCode}::${countryCode}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('PROVIDER_ERROR');
    expect(res.json().error.details.attempts).toEqual([{ outcome: 'provider_error' }]);
    expect(JSON.stringify(res.json())).not.toMatch(/mock sim bank/i); // reseller never named
  });

  it('cancels and refunds via v2', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 300_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const key = await keyFor(userId);

    const created = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { product_id: `${serviceCode}::${countryCode}` },
    });
    const orderId = created.json().data.id as string;

    const canceled = await inject({
      method: 'POST',
      url: `/api/v2/orders/${orderId}/cancel`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().data.status).toBe('canceled');
    expect((await User.findById(userId))!.balanceMicro).toBe(1_000_000);
  });

  it('management: issue, list, revoke', async () => {
    const { cookie } = await makeUser(app);

    const created = await inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      headers: { cookie },
      payload: { label: 'CI' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().key).toMatch(/^smsg_live_/);
    const id = created.json().id as string;

    const list = await inject({ method: 'GET', url: '/api/v1/api-keys', headers: { cookie } });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].key).toBeUndefined();

    const del = await inject({
      method: 'DELETE',
      url: `/api/v1/api-keys/${id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(200);
    // Revoked keys drop out of the list entirely — only the active key (if
    // any) is ever surfaced, not a history of dead ones.
    const listAfter = await inject({
      method: 'GET',
      url: '/api/v1/api-keys',
      headers: { cookie },
    });
    expect(listAfter.json()).toHaveLength(0);
  });

  it('one active key per account: generating a new one revokes the old one', async () => {
    const { cookie } = await makeUser(app);

    const first = await inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      headers: { cookie },
      payload: { label: 'first' },
    });
    const firstKey = first.json().key as string;

    const second = await inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      headers: { cookie },
      payload: { label: 'second' },
    });
    expect(second.statusCode).toBe(201);

    // Only the new key is listed.
    const list = await inject({ method: 'GET', url: '/api/v1/api-keys', headers: { cookie } });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].label).toBe('second');

    // The old key no longer authenticates.
    const usedOld = await inject({
      method: 'GET',
      url: '/api/v2/balance',
      headers: { authorization: `Bearer ${firstKey}` },
    });
    expect(usedOld.statusCode).toBe(401);

    // The new key works.
    const usedNew = await inject({
      method: 'GET',
      url: '/api/v2/balance',
      headers: { authorization: `Bearer ${second.json().key}` },
    });
    expect(usedNew.statusCode).toBe(200);
  });
});
