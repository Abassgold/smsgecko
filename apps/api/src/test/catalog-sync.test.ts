import { beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { buildApp } from '../app.js';
import { makeInject } from './inject.js';
import { makeAdmin, makeCatalog, makeUser } from './factories.js';
import { ApiKey } from '../models/ApiKey.js';
import { CatalogOffer } from '../models/CatalogOffer.js';
import { Setting } from '../models/Setting.js';
import { User } from '../models/User.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { encryptJson } from '../lib/secretbox.js';
import { bustProviderCache } from '../providers/sms/registry.js';
import { buildTiers, resetStoredCatalogMemo, syncCatalog, waitForSync } from '../services/catalogSync.js';
import { setOfferDisabled } from '../services/admin/catalog.service.js';
import { createOrder } from '../services/orders.service.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});

/** Re-point the mock provider's catalog (what the provider says NOW) without touching what was synced. */
async function setMock(cat: { serviceCode: string; countryCode: string }, price: number, knobs: Record<string, unknown> = {}) {
  await ProviderConfig.updateOne(
    { key: 'mock' },
    {
      $set: {
        configEnc: encryptJson({
          catalogPriceMicro: price,
          catalogStock: 7,
          catalogServices: [{ code: cat.serviceCode, name: cat.serviceCode }],
          catalogCountries: [{ code: cat.countryCode, name: cat.countryCode, iso2: 'us', dialCode: '1' }],
          ...knobs,
        }),
      },
    },
  );
  bustProviderCache();
  resetStoredCatalogMemo();
}

async function setup(price = 300_000) {
  const cat = await makeCatalog({ priceMicro: price, stock: 7 });
  const { userId } = await makeUser(app, { balanceMicro: 5_000_000 });
  const { key } = await ApiKey.issue(userId, 'sync-test');
  const products = async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/v2/catalog/products?service=${cat.serviceCode}`,
      headers: { authorization: `Bearer ${key}` },
    });
    return res.json().data as { country_code: string; price: string }[];
  };
  const handler = (query: Record<string, string>) =>
    inject({ method: 'GET', url: '/stubs/handler_api.php', query: { api_key: key, ...query } });
  return { cat, userId, key, products, handler };
}

describe('catalog sync (manesms sequence)', () => {
  it('stores every country × service, and browsing reads the stored copy while checkout stays live', async () => {
    const s = await setup(300_000);
    const report = await syncCatalog();
    expect(report).toMatchObject({ offersUpdated: 1, offersInStock: 1, countriesSkipped: [] });
    expect((await s.products()).map((p) => p.price)).toEqual(['0.3']);

    // The provider changes its price. Browsing still shows what was synced...
    await setMock(s.cat, 500_000);
    expect((await s.products()).map((p) => p.price)).toEqual(['0.3']);
    // ...but a purchase is priced live, so nobody is charged on a stale copy.
    const user = (await User.findById(s.userId))!;
    const { order } = await createOrder(user, { serviceId: s.cat.serviceCode, countryId: s.cat.countryCode }, 'api');
    expect(order.priceMicro).toBe(500_000);

    // The next sync catches up.
    await syncCatalog();
    expect((await s.products()).map((p) => p.price)).toEqual(['0.5']);
  });

  it('getPrices without a service answers from the stored catalog; before any sync it cannot', async () => {
    const s = await setup(450_000);
    expect((await s.handler({ action: 'getPrices' })).text).toBe('BAD_SERVICE'); // nothing stored yet

    await syncCatalog();
    const all = (await s.handler({ action: 'getPrices' })).json();
    expect(all[s.cat.countryCode][s.cat.serviceCode]).toEqual({ cost: '0.4500', count: 7 });
    const v2 = (await s.handler({ action: 'getPricesV2', country: s.cat.countryCode })).json();
    expect(v2[s.cat.countryCode][s.cat.serviceCode].prices).toEqual({ '0.4500': 7 });
  });

  it('a country whose price fetch fails keeps its old offers', async () => {
    const s = await setup(300_000);
    await syncCatalog();
    await setMock(s.cat, 900_000, { failCountryPrices: true });
    const report = await syncCatalog();
    expect(report.countriesSkipped).toEqual([s.cat.countryCode]);
    expect(report.offersUpdated).toBe(0);
    const stored = await CatalogOffer.findOne({ serviceCode: s.cat.serviceCode });
    expect(stored!.tiers[0]!.priceMicro).toBe(300_000); // untouched, not zeroed
  });

  it('refuses to overwrite anything when the provider returns no countries', async () => {
    const s = await setup(300_000);
    await syncCatalog();
    await setMock(s.cat, 300_000, { noCountries: true });
    await expect(syncCatalog()).rejects.toThrow(/no countries/);
    const stored = await CatalogOffer.find({ serviceCode: s.cat.serviceCode });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tiers[0]!.priceMicro).toBe(300_000);
  });

  it('a service the country stops listing becomes sold out', async () => {
    const s = await setup(300_000);
    await syncCatalog();
    // Same country, but the provider now lists a different service only.
    await setMock({ serviceCode: 'other-svc', countryCode: s.cat.countryCode }, 300_000);
    await syncCatalog();
    const old = await CatalogOffer.findOne({ serviceCode: s.cat.serviceCode });
    expect(old!.tiers).toHaveLength(0);
    expect(await s.products()).toEqual([]);
  });

  it('an admin-disabled offer is hidden, cannot be bought, and a sync never switches it back on', async () => {
    const s = await setup(300_000);
    await syncCatalog();
    const admin = await makeAdmin(app);
    await setOfferDisabled(admin.userId, { serviceCode: s.cat.serviceCode, countryCode: s.cat.countryCode, disabled: true });

    expect(await s.products()).toEqual([]);
    const user = (await User.findById(s.userId))!;
    await expect(
      createOrder(user, { serviceId: s.cat.serviceCode, countryId: s.cat.countryCode }, 'api'),
    ).rejects.toMatchObject({ code: 'NO_OFFER_AVAILABLE' });
    expect((await s.handler({ action: 'getPrices', service: s.cat.serviceCode })).json()).toEqual({});

    await syncCatalog(); // fresh prices, still disabled
    expect((await CatalogOffer.findOne({ serviceCode: s.cat.serviceCode }))!.adminDisabled).toBe(true);
    expect(await s.products()).toEqual([]);

    await setOfferDisabled(admin.userId, { serviceCode: s.cat.serviceCode, countryCode: s.cat.countryCode, disabled: false });
    expect((await s.products()).map((p) => p.price)).toEqual(['0.3']);
    const { order } = await createOrder(user, { serviceId: s.cat.serviceCode, countryId: s.cat.countryCode }, 'api');
    expect(order.status).toBe('waiting');
  });

  it('a stored copy older than 6 hours is not trusted: reads go back to the provider', async () => {
    const s = await setup(300_000);
    await syncCatalog();
    await setMock(s.cat, 700_000);
    expect((await s.products()).map((p) => p.price)).toEqual(['0.3']); // still fresh

    await Setting.updateOne({ _id: 'global' }, { $set: { 'catalogSync.at': new Date(Date.now() - 7 * 3_600_000) } });
    resetStoredCatalogMemo();
    expect((await s.products()).map((p) => p.price)).toEqual(['0.7']); // live again
  });

  it('only one sync runs at a time', async () => {
    await setup(300_000);
    const [a, b] = [syncCatalog(), syncCatalog()];
    expect(a).toBe(b);
    await a;
  });
});

describe('admin catalog endpoints', () => {
  it('sync now starts in the background, status reports it, and offers can be switched off over HTTP', async () => {
    const s = await setup(300_000);
    const admin = await makeAdmin(app);
    const cookie = { cookie: admin.cookie };

    const denied = await inject({ method: 'POST', url: '/api/v1/admin/catalog/sync' });
    expect(denied.statusCode).toBe(401);

    const started = await inject({ method: 'POST', url: '/api/v1/admin/catalog/sync', headers: cookie });
    expect(started.statusCode).toBe(202);
    await waitForSync();

    const status = (await inject({ method: 'GET', url: '/api/v1/admin/catalog', headers: cookie })).json();
    expect(status.syncing).toBe(false);
    expect(status.lastSync).toMatchObject({ offersUpdated: 1, offersInStock: 1 });

    const off = await inject({
      method: 'PATCH',
      url: '/api/v1/admin/catalog/offers',
      headers: cookie,
      payload: { serviceCode: s.cat.serviceCode, countryCode: s.cat.countryCode, disabled: true },
    });
    expect(off.statusCode).toBe(200);
    const after = (await inject({ method: 'GET', url: '/api/v1/admin/catalog', headers: cookie })).json();
    expect(after.disabledOffers).toEqual([{ serviceCode: s.cat.serviceCode, countryCode: s.cat.countryCode }]);
  });
});

describe('buildTiers', () => {
  it('drops unsellable rows, sorts cheapest first and removes duplicates', () => {
    const t = buildTiers([
      { serviceCode: 'wa', countryCode: '1', priceMicro: 500_000, stock: 5 },
      { serviceCode: 'wa', countryCode: '1', priceMicro: 300_000, stock: 9 },
      { serviceCode: 'wa', countryCode: '1', priceMicro: 300_000, stock: 9 }, // duplicate
      { serviceCode: 'wa', countryCode: '1', priceMicro: 100_000, stock: 0 }, // sold out
      { serviceCode: 'wa', countryCode: '1', priceMicro: 0, stock: 5 }, // free = not real
      { serviceCode: 'tg', countryCode: '1', priceMicro: 200_000, stock: null }, // stock unknown still sells
    ]);
    expect(t.get('wa')!.map((x) => x.priceMicro)).toEqual([300_000, 500_000]);
    expect(t.get('tg')!.map((x) => x.priceMicro)).toEqual([200_000]);
  });
});
