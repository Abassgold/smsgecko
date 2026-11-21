import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeAdmin } from './factories.js';
import { ensureProviders } from '../lib/ensureProviders.js';
import { decryptJson, encryptJson } from '../lib/secretbox.js';
import { CatalogOffer } from '../models/CatalogOffer.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { getProviderForOrder } from '../providers/sms/registry.js';
import type { OrderDoc } from '../models/Order.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});

const ENV_VARS = ['HERO_SMS_API_KEY', 'SMSBOWER_API_KEY', 'SMSBOWER_USER_ID', 'TIGERSMS_API_KEY'];
afterEach(() => {
  for (const v of ENV_VARS) delete process.env[v];
});

type Row = { id: string; key: string; enabled: boolean; envVars: string[]; missingEnvVars: string[] };

async function list(): Promise<Row[]> {
  const { cookie } = await makeAdmin(app);
  const res = await inject({ method: 'GET', url: '/api/v1/admin/providers', headers: { cookie } });
  return (res.json() as Row[]).filter((r) => r.key !== 'mock');
}

describe('built-in reseller providers', () => {
  it('lists every reseller, disabled, and is idempotent', async () => {
    await ensureProviders();
    await ensureProviders();
    const rows = await list();
    expect(rows.map((r) => r.key).sort()).toEqual(['hero_sms', 'sms_bower', 'tiger_sms']);
    expect(rows.every((r) => !r.enabled)).toBe(true);
  });

  it('reports which env vars are missing', async () => {
    process.env.TIGERSMS_API_KEY = 'tiger-key';
    await ensureProviders();
    const byKey = Object.fromEntries((await list()).map((r) => [r.key, r]));
    expect(byKey.tiger_sms!.missingEnvVars).toEqual([]);
    expect(byKey.sms_bower!.missingEnvVars).toEqual(['SMSBOWER_API_KEY', 'SMSBOWER_USER_ID']);
    expect(byKey.hero_sms!.envVars).toEqual(['HERO_SMS_API_KEY']);
    expect(byKey.tiger_sms!.envVars).toEqual(['TIGERSMS_API_KEY']);
  });

  it('refuses to enable a reseller until its env credentials are set', async () => {
    await ensureProviders();
    const { cookie } = await makeAdmin(app);
    const hero = await ProviderConfig.findOne({ key: 'hero_sms' });
    const url = `/api/v1/admin/providers/${hero!.id}`;

    const blocked = await inject({ method: 'PATCH', url, headers: { cookie }, payload: { enabled: true } });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error.message).toContain('HERO_SMS_API_KEY');

    process.env.HERO_SMS_API_KEY = 'hero-key';
    const ok = await inject({ method: 'PATCH', url, headers: { cookie }, payload: { enabled: true } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().enabled).toBe(true);
  });

  it('never stores credentials, and strips ones left from before', async () => {
    await ProviderConfig.create({
      key: 'hero_sms',
      label: 'hero-sms',
      configEnc: encryptJson({ baseUrl: 'https://x', apiKey: 'old-db-key', serviceMap: { wa: '1' } }),
    });
    await ensureProviders();
    const row = await ProviderConfig.findOne({ key: 'hero_sms' });
    expect(decryptJson(row!.configEnc)).toEqual({ serviceMap: { wa: '1' } });

    // A key sent through the admin API is dropped too.
    const { cookie } = await makeAdmin(app);
    await inject({
      method: 'PATCH',
      url: `/api/v1/admin/providers/${row!.id}`,
      headers: { cookie },
      payload: { config: { apiKey: 'typed-in-admin' } },
    });
    const after = await ProviderConfig.findOne({ key: 'hero_sms' });
    expect(decryptJson(after!.configEnc)).toEqual({ serviceMap: { wa: '1' } });
  });

  it('the adapter gets its key from env at runtime', async () => {
    process.env.TIGERSMS_API_KEY = 'tiger-key';
    await ensureProviders();
    const tiger = await ProviderConfig.findOne({ key: 'tiger_sms' });
    const provider = await getProviderForOrder({ providerConfigId: tiger!._id } as unknown as OrderDoc);
    // The adapter keeps its config privately; the key reaching it is what matters.
    expect((provider as unknown as { cfg: Record<string, unknown> }).cfg).toMatchObject({
      apiKey: 'tiger-key',
      baseUrl: 'https://api.tiger-sms.com/stubs/handler_api.php',
    });
  });

  it('removes the providers we no longer sell through, with their offers, and leaves the three we keep', async () => {
    // A database from before the cut: rows for the retired adapters (written raw: the model no longer allows those keys).
    const old = await ProviderConfig.collection.insertMany([
      { key: 'sms_pool', label: 'smspool', enabled: true, priority: 1, configEnc: encryptJson({}) },
      { key: 'sms_code', label: 'smscode', enabled: true, priority: 2, configEnc: encryptJson({}) },
      { key: 'custom_http', label: 'Reseller X', enabled: true, priority: 3, configEnc: encryptJson({}) },
    ]);
    const oldIds = Object.values(old.insertedIds);
    await CatalogOffer.collection.insertOne({ providerConfigId: oldIds[0], serviceCode: 'wa', countryCode: 'us' });
    await ensureProviders();
    const keys = (await ProviderConfig.collection.find({}).toArray()).map((r) => r.key as string).filter((k) => k !== 'mock');
    expect(keys.sort()).toEqual(['hero_sms', 'sms_bower', 'tiger_sms']);
    expect(await CatalogOffer.collection.countDocuments({ providerConfigId: { $in: oldIds } })).toBe(0);
    await ensureProviders(); // and again: nothing left to remove, nothing breaks
  });
});
