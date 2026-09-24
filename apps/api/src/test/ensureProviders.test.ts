import { beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeAdmin } from './factories.js';
import { ensureProviders } from '../lib/ensureProviders.js';
import { ProviderConfig } from '../models/ProviderConfig.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});

describe('built-in provider placeholders', () => {
  it('lists every reseller adapter, disabled, and is idempotent', async () => {
    await ensureProviders();
    await ensureProviders();

    const { cookie } = await makeAdmin(app);
    const res = await inject({ method: 'GET', url: '/api/v1/admin/providers', headers: { cookie } });
    const rows = res.json() as Array<{ key: string; enabled: boolean; config: Record<string, unknown> }>;
    const resellers = rows.filter((r) => r.key !== 'mock');

    expect(resellers.map((r) => r.key).sort()).toEqual(['hero_sms', 'sms_bower', 'sms_code', 'sms_pool']);
    expect(resellers.every((r) => !r.enabled)).toBe(true);
    expect(resellers.find((r) => r.key === 'sms_pool')?.config.baseUrl).toBe('https://api.smspool.net');
  });

  it('leaves an existing row for the same adapter alone', async () => {
    await ProviderConfig.create({ key: 'sms_pool', label: 'My SMSPool', enabled: false });
    await ensureProviders();
    const pools = await ProviderConfig.find({ key: 'sms_pool' });
    expect(pools.map((p) => p.label)).toEqual(['My SMSPool']);
  });

  it('refuses to turn a provider on until it has an API key', async () => {
    await ensureProviders();
    const { cookie } = await makeAdmin(app);
    const hero = await ProviderConfig.findOne({ key: 'hero_sms' });
    const url = `/api/v1/admin/providers/${hero!.id}`;

    const blocked = await inject({ method: 'PATCH', url, headers: { cookie }, payload: { enabled: true } });
    expect(blocked.statusCode).toBe(400);

    const ok = await inject({
      method: 'PATCH',
      url,
      headers: { cookie },
      payload: { enabled: true, config: { apiKey: 'hero_key_1234' } },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().enabled).toBe(true);
    expect(ok.json().config.apiKey).toBe('••••1234');
  });
});
