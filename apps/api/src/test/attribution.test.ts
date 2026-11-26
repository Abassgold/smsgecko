import { beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeAdmin } from './factories.js';
import { credit } from '../lib/ledger.js';
import { clientIp, countryOf, sourceOf } from '../lib/attribution.js';
import { User } from '../models/User.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});

const req = (headers: Record<string, string> = {}, ip = '10.0.0.1') => ({ headers, ip });
const cookie = (v: object | string) => ({ cookies: { gecko_src: typeof v === 'string' ? v : JSON.stringify(v) } });

describe('signup attribution helpers', () => {
  it('reads the left-most public client address and looks the country up offline', () => {
    expect(clientIp(req({ 'x-forwarded-for': '102.89.0.1, 10.1.2.3, 34.1.1.1' }))).toBe('102.89.0.1');
    expect(countryOf(req({ 'x-forwarded-for': '102.89.0.1' }))).toBe('NG');
    expect(countryOf(req({ 'cf-ipcountry': 'GH', 'x-forwarded-for': '8.8.8.8' }))).toBe('GH');
    expect(countryOf(req())).toBeNull();
  });

  it('labels the source from utm tags, ad clicks, referrer or referral links, and survives junk', () => {
    expect(sourceOf(cookie({ s: 'Facebook', c: 'ng-launch', l: '/' }))).toMatchObject({ channel: 'facebook', utmCampaign: 'ng-launch' });
    expect(sourceOf(cookie({ k: 'gclid', l: '/' })).channel).toBe('google ads');
    expect(sourceOf(cookie({ r: 'https://www.reddit.com/x', l: '/' })).channel).toBe('reddit.com');
    expect(sourceOf(cookie({ l: '/r/ABC' })).channel).toBe('referral');
    expect(sourceOf(cookie('not json')).channel).toBe('direct');
    expect(sourceOf({ cookies: {} }).channel).toBe('direct');
  });
});

describe('signup attribution end to end', () => {
  const signup = async (ip: string, src: object) => {
    const email = `a${Math.random().toString(36).slice(2, 8)}@test.dev`;
    const res = await inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-forwarded-for': ip, cookie: `gecko_src=${encodeURIComponent(JSON.stringify(src))}` },
      payload: { email, password: 'supersecret1' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().user.id as string;
  };

  it('stores country (never the IP) and source; the audience report and user filter use them', async () => {
    const ng1 = await signup('102.89.0.1', { s: 'facebook', c: 'ng-launch', l: '/' });
    await signup('102.89.0.2', { s: 'facebook', l: '/' });
    await signup('8.8.8.8', { k: 'gclid', l: '/' });

    const u = (await User.findById(ng1).lean())!;
    expect(u.signupCountry).toBe('NG');
    expect(u.signupSource).toMatchObject({ channel: 'facebook', utmCampaign: 'ng-launch' });
    expect(JSON.stringify(u)).not.toContain('102.89.0.1');

    await credit(ng1, 5_000_000, { type: 'deposit', description: 'test' });

    const { cookie: admin } = await makeAdmin(app);
    const res = await inject({ method: 'GET', url: '/api/v1/admin/audience/?days=0', headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalSignups).toBe(3);
    expect(body.countries[0]).toEqual({ key: 'NG', signups: 2, payers: 1, depositsMicro: 5_000_000 });
    expect(body.sources[0]).toMatchObject({ key: 'facebook', signups: 2, topCountries: [{ country: 'NG', signups: 2 }] });

    const list = await inject({ method: 'GET', url: '/api/v1/admin/users/?country=NG', headers: { cookie: admin } });
    expect(list.json().total).toBe(2);
    expect(list.json().items[0]).toMatchObject({ signupCountry: 'NG', signupSource: { channel: 'facebook' } });

    const user = await inject({ method: 'GET', url: '/api/v1/admin/audience/', headers: { cookie: '' } });
    expect(user.statusCode).toBe(401);
  });
});
