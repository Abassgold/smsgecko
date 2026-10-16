import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeCatalog, makeUser, simulateOtp } from './factories.js';
import { ApiKey } from '../models/ApiKey.js';
import { Order } from '../models/Order.js';
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

  it('POST /orders/create does exactly what POST /orders does (same handler, shared idempotency)', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 200_000, stock: 5 });
    const productId = `${serviceCode}::${countryCode}`;
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);

    const viaCreate = await inject({
      method: 'POST',
      url: '/api/v2/orders/create',
      headers: { authorization: `Bearer ${key}`, 'idempotency-key': 'v2-create-alias-1' },
      payload: { catalog_product_id: productId, max_price: '0.50' },
    });
    expect(viaCreate.statusCode).toBe(201);
    expect(viaCreate.json().data.status).toBe('waiting');

    // The same replay-safe key on the other address hands back the same order: one purchase, not two.
    const viaOrders = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}`, 'idempotency-key': 'v2-create-alias-1' },
      payload: { catalog_product_id: productId, max_price: '0.50' },
    });
    expect(viaOrders.json().data.id).toBe(viaCreate.json().data.id);

    // Still needs a valid key and a valid body.
    const noKey = await inject({ method: 'POST', url: '/api/v2/orders/create', payload: { catalog_product_id: productId } });
    expect(noKey.statusCode).toBe(401);
    const badBody = await inject({ method: 'POST', url: '/api/v2/orders/create', headers: { authorization: `Bearer ${key}` }, payload: {} });
    expect(badBody.statusCode).toBe(400);
  });

  it('POST /orders/finish takes the id in the body and does what /orders/:id/finish does', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 200_000, stock: 5 });
    const productId = `${serviceCode}::${countryCode}`;
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);
    const created = await inject({
      method: 'POST',
      url: '/api/v2/orders/create',
      headers: { authorization: `Bearer ${key}` },
      payload: { catalog_product_id: productId },
    });
    const orderId = created.json().data.id as string;
    await simulateOtp(orderId);

    const finished = await inject({
      method: 'POST',
      url: '/api/v2/orders/finish',
      headers: { authorization: `Bearer ${key}` },
      payload: { id: orderId },
    });
    expect(finished.statusCode).toBe(200);
    expect(finished.json().success).toBe(true);
    expect(finished.json().data.id).toBe(orderId);
    expect(finished.json().data.finished_at).toBeTruthy();

    // Doing it again, on either address, is harmless and keeps the same finish time.
    const again = await inject({ method: 'POST', url: `/api/v2/orders/${orderId}/finish`, headers: { authorization: `Bearer ${key}` } });
    expect(again.json().data.finished_at).toBe(finished.json().data.finished_at);

    // Needs the key, a well-formed id, and an order that exists.
    const noKey = await inject({ method: 'POST', url: '/api/v2/orders/finish', payload: { id: orderId } });
    expect(noKey.statusCode).toBe(401);
    const noId = await inject({ method: 'POST', url: '/api/v2/orders/finish', headers: { authorization: `Bearer ${key}` }, payload: {} });
    expect(noId.statusCode).toBe(400);
    const badId = await inject({ method: 'POST', url: '/api/v2/orders/finish', headers: { authorization: `Bearer ${key}` }, payload: { id: 'not-an-id' } });
    expect(badId.statusCode).toBe(400);
    const unknown = await inject({ method: 'POST', url: '/api/v2/orders/finish', headers: { authorization: `Bearer ${key}` }, payload: { id: 'SG-ZZZZ-99' } });
    expect(unknown.statusCode).toBe(404);
  });

  it('body-style cancel, resend and reactivate (POST /orders/<action> with {id}) do what the /orders/:id/<action> routes do', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 200_000, stock: 9 });
    const productId = `${serviceCode}::${countryCode}`;
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);
    const auth = { authorization: `Bearer ${key}` };
    const balance = async () => (await User.findById(userId))!.balanceMicro;
    const create = async () => (await inject({ method: 'POST', url: '/api/v2/orders/create', headers: auth, payload: { catalog_product_id: productId } })).json().data.id as string;

    // resend + cancel on a waiting order, id in the body
    const waitingId = await create();
    const resent = await inject({ method: 'POST', url: '/api/v2/orders/resend', headers: auth, payload: { id: waitingId } });
    expect(resent.statusCode).toBe(200);
    expect(resent.json().data.status).toBe('waiting');
    expect(await balance()).toBe(1_800_000); // resend is free

    const canceled = await inject({ method: 'POST', url: '/api/v2/orders/cancel', headers: auth, payload: { id: waitingId } });
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().data.status).toBe('canceled');
    expect(await balance()).toBe(2_000_000); // refunded in full

    // cancelling again is refused and refunds nothing more
    const twice = await inject({ method: 'POST', url: '/api/v2/orders/cancel', headers: auth, payload: { id: waitingId } });
    expect(twice.statusCode).toBe(409);
    expect(await balance()).toBe(2_000_000);

    // reactivate a completed order, id in the body: charged again, reopened as waiting
    const doneId = await create();
    await simulateOtp(doneId);
    expect(await balance()).toBe(1_800_000);
    const reopened = await inject({ method: 'POST', url: '/api/v2/orders/reactivate', headers: auth, payload: { id: doneId } });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json().data.status).toBe('waiting');
    expect(await balance()).toBe(1_600_000);

    // the two reactivate addresses share ONE throttle: calling the other one straight away is refused, nothing is charged
    const quick = await inject({ method: 'POST', url: `/api/v2/orders/${doneId}/reactivate`, headers: auth });
    expect(quick.statusCode).toBe(429);
    expect(await balance()).toBe(1_600_000);

    // auth and id checks apply to all three. (reactivate is throttled before its body is read, so its 400 check uses a fresh user
    // and a single call: a second call inside the 3s gap would be a 429 by design.)
    for (const action of ['cancel', 'resend', 'reactivate']) {
      const noKey = await inject({ method: 'POST', url: `/api/v2/orders/${action}`, payload: { id: doneId } });
      expect(noKey.statusCode).toBe(401);
    }
    const noId = await inject({ method: 'POST', url: '/api/v2/orders/cancel', headers: auth, payload: {} });
    expect(noId.statusCode).toBe(400);
    const badId = await inject({ method: 'POST', url: '/api/v2/orders/cancel', headers: auth, payload: { id: 'not-an-id' } });
    expect(badId.statusCode).toBe(400);
    const { userId: otherUser } = await makeUser(app, { balanceMicro: 1_000_000 });
    const otherKey = await keyFor(otherUser);
    for (const action of ['resend', 'reactivate']) {
      const missing = await inject({ method: 'POST', url: `/api/v2/orders/${action}`, headers: { authorization: `Bearer ${otherKey}` }, payload: {} });
      expect(missing.statusCode).toBe(400);
    }
    const unknown = await inject({ method: 'POST', url: '/api/v2/orders/cancel', headers: auth, payload: { id: 'SG-ZZZZ-99' } });
    expect(unknown.statusCode).toBe(404);
  });

  it('resend: a provider that refuses is reported as PROVIDER_ERROR (not a fake 200), and resend is throttled across both addresses', async () => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 200_000, stock: 9 });
    const productId = `${serviceCode}::${countryCode}`;
    const mockConfig = (extra: object) =>
      encryptJson({
        catalogPriceMicro: 200_000,
        catalogStock: 9,
        catalogServices: [{ code: serviceCode, name: serviceCode }],
        catalogCountries: [{ code: countryCode, name: countryCode, iso2: 'us', dialCode: '1' }],
        ...extra,
      });

    // User A buys a number, then the provider starts refusing resends.
    const { userId: a } = await makeUser(app, { balanceMicro: 2_000_000 });
    const keyA = await keyFor(a);
    const authA = { authorization: `Bearer ${keyA}` };
    const orderA = (await inject({ method: 'POST', url: '/api/v2/orders/create', headers: authA, payload: { catalog_product_id: productId } })).json().data.id as string;
    await ProviderConfig.updateOne({ key: 'mock' }, { $set: { configEnc: mockConfig({ failResend: true }) } });
    bustProviderCache();

    const refused = await inject({ method: 'POST', url: '/api/v2/orders/resend', headers: authA, payload: { id: orderA } });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().error.code).toBe('PROVIDER_ERROR');
    expect(JSON.stringify(refused.json())).not.toMatch(/mock|forced resend failure/i); // no provider detail leaks
    const after = await inject({ method: 'GET', url: `/api/v2/orders/${orderA}`, headers: authA });
    expect(after.json().data.status).toBe('waiting'); // the order itself is untouched
    expect((await User.findById(a))!.balanceMicro).toBe(1_800_000); // only the purchase was charged

    // Straight after, the other address is throttled too (one shared throttle).
    const tooSoon = await inject({ method: 'POST', url: `/api/v2/orders/${orderA}/resend`, headers: authA });
    expect(tooSoon.statusCode).toBe(429);

    // The provider recovers. User B: resend works, and a second call on either address inside the gap is throttled.
    await ProviderConfig.updateOne({ key: 'mock' }, { $set: { configEnc: mockConfig({}) } });
    bustProviderCache();
    const { userId: b } = await makeUser(app, { balanceMicro: 2_000_000 });
    const authB = { authorization: `Bearer ${await keyFor(b)}` };
    const orderB = (await inject({ method: 'POST', url: '/api/v2/orders/create', headers: authB, payload: { catalog_product_id: productId } })).json().data.id as string;
    const ok = await inject({ method: 'POST', url: `/api/v2/orders/${orderB}/resend`, headers: authB });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.status).toBe('waiting');
    const again = await inject({ method: 'POST', url: '/api/v2/orders/resend', headers: authB, payload: { id: orderB } });
    expect(again.statusCode).toBe(429);
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

  it.each(['-1', '1e3', '1e-2', 'abc', '', ' 0.5', '0.5 ', '$0.50', '0.1234567', '+1', '.5'])(
    'rejects a malformed max_price (%j) instead of guessing a different cap',
    async (bad) => {
      const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 800_000, stock: 5 });
      const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
      const key = await keyFor(userId);

      const res = await inject({
        method: 'POST',
        url: '/api/v2/orders',
        headers: { authorization: `Bearer ${key}` },
        payload: { catalog_product_id: `${serviceCode}::${countryCode}`, max_price: bad },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toMatch(/max_price/);
    },
  );

  // The cap is used as written: below the $0.80 price it is a 422 (never a 400), at or above it the order goes through.
  it.each([
    ['0', 422],
    ['0.50', 422],
    ['0.8', 201],
    ['1', 201],
    ['12.345678', 201],
  ])('accepts a plain decimal max_price (%j) as written -> %i', async (cap, expected) => {
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 800_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);

    const res = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { catalog_product_id: `${serviceCode}::${countryCode}`, max_price: cap },
    });
    expect(res.statusCode).toBe(expected);
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

describe('v2 order short id (SG-XXXX-XX)', () => {
  it('returns a short id and finds the order by short id AND by raw _id', async () => {
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);
    const { serviceCode, countryCode } = await makeCatalog({ priceMicro: 200_000, stock: 5 });

    const created = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { catalog_product_id: `${serviceCode}::${countryCode}` },
    });
    expect(created.statusCode).toBe(201);
    const shortId = (created.json() as { data: { id: string } }).data.id;
    // Customer-facing id is the branded short reference, not the 24-hex _id.
    expect(shortId).toMatch(/^SG-[0-9A-Z]{4}-[0-9A-Z]{2}$/);

    // GET by the short id works.
    const byShort = await inject({
      method: 'GET',
      url: `/api/v2/orders/${shortId}`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(byShort.statusCode).toBe(200);
    expect((byShort.json() as { data: { id: string } }).data.id).toBe(shortId);

    // Backward compatible: GET by the raw 24-hex _id still works.
    const hexId = (await Order.findOne({ publicId: shortId }))!.id as string;
    expect(hexId).toMatch(/^[a-f0-9]{24}$/);
    const byHex = await inject({
      method: 'GET',
      url: `/api/v2/orders/${hexId}`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(byHex.statusCode).toBe(200);
    expect((byHex.json() as { data: { id: string } }).data.id).toBe(shortId);
  });
});
