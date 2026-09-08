import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from '../../test/inject.js';
import { buildApp } from '../../app.js';
import { makeCatalog, makeUser, simulateOtp } from '../../test/factories.js';
import { ApiKey } from '../../models/ApiKey.js';
import { Order } from '../../models/Order.js';
import { User } from '../../models/User.js';

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

  it('lists catalog products with string prices', async () => {
    const { offer } = await makeCatalog({ priceMicro: 500_000, stock: 7 });
    const { userId } = await makeUser(app);
    const key = await keyFor(userId);

    const res = await inject({
      method: 'GET',
      url: '/api/v2/catalog/products',
      headers: { authorization: `Bearer ${key}` },
    });
    expect(res.statusCode).toBe(200);
    const found = res.json().data.find((p: { id: string }) => p.id === (offer.id as string));
    expect(found.price).toBe('0.5');
    expect(found.stock).toBe(7);
  });

  it('runs create → poll → finish', async () => {
    const { offer } = await makeCatalog({ priceMicro: 200_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);

    const created = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}`, 'idempotency-key': 'v2-key-abc123' },
      payload: { catalog_product_id: offer.id, max_price: '0.50' },
    });
    expect(created.statusCode).toBe(201);
    const orderId = created.json().id as string;
    expect(created.json().status).toBe('waiting');
    expect(created.json().price).toBe('0.2');

    // idempotent
    const again = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}`, 'idempotency-key': 'v2-key-abc123' },
      payload: { catalog_product_id: offer.id },
    });
    expect(again.json().id).toBe(orderId);

    await simulateOtp(orderId);

    const polled = await inject({
      method: 'GET',
      url: `/api/v2/orders/${orderId}`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(polled.json().status).toBe('completed');
    expect(polled.json().otp_code).toMatch(/^\d{4,8}$/);
    expect(polled.json().sms).toHaveLength(1);

    const finished = await inject({
      method: 'POST',
      url: `/api/v2/orders/${orderId}/finish`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(finished.statusCode).toBe(200);
    expect(finished.json().finished_at).toBeTruthy();
  });

  it('rejects max_price below the offer price', async () => {
    const { offer } = await makeCatalog({ priceMicro: 800_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 2_000_000 });
    const key = await keyFor(userId);

    const res = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { catalog_product_id: offer.id, max_price: '0.10' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('cancels and refunds via v2', async () => {
    const { offer } = await makeCatalog({ priceMicro: 300_000, stock: 5 });
    const { userId } = await makeUser(app, { balanceMicro: 1_000_000 });
    const key = await keyFor(userId);

    const created = await inject({
      method: 'POST',
      url: '/api/v2/orders',
      headers: { authorization: `Bearer ${key}` },
      payload: { product_id: offer.id },
    });
    const orderId = created.json().id as string;

    const canceled = await inject({
      method: 'POST',
      url: `/api/v2/orders/${orderId}/cancel`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().status).toBe('canceled');
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
    const listAfter = await inject({
      method: 'GET',
      url: '/api/v1/api-keys',
      headers: { cookie },
    });
    expect(listAfter.json()[0].revoked).toBe(true);
  });
});
