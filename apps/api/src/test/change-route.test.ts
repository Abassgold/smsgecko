import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeRoute, rerouteListing } from '../providers/sms/changeRoute.js';
import { HeroSmsProvider } from '../providers/sms/adapters/heroSms.js';
import { SmsBowerProvider } from '../providers/sms/adapters/smsBower.js';
import { TigerSmsProvider } from '../providers/sms/adapters/tigerSms.js';

afterEach(() => vi.unstubAllGlobals());

/** Records every upstream request; `reply` answers by URL. */
function stub(reply: (url: URL) => unknown) {
  const calls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      calls.push(url);
      const out = reply(url);
      return new Response(typeof out === 'string' ? out : JSON.stringify(out), { status: 200 });
    }),
  );
  return calls;
}
const NUMBER = 'ACCESS_NUMBER:555:12025550123';

describe('changeRoute (USA WhatsApp -> Canada)', () => {
  it('reroutes only 187 + wa', () => {
    expect(changeRoute('187', 'wa')).toBe('36');
    expect(changeRoute(' 187 ', 'WA')).toBe('36');
    expect(changeRoute('187', 'tg')).toBe('187');
    expect(changeRoute('6', 'wa')).toBe('6');
    expect(changeRoute('36', 'wa')).toBe('36');
  });

  it('rerouteListing shows Canada tiers under the USA code and keeps everything else', () => {
    const rows = [
      { countryCode: '187', priceMicro: 300_000 },
      { countryCode: '36', priceMicro: 500_000 },
      { countryCode: '6', priceMicro: 100_000 },
    ];
    const out = rerouteListing(rows, 'wa');
    expect(out.find((r) => r.countryCode === '187')).toEqual({ countryCode: '187', priceMicro: 500_000 });
    expect(out.find((r) => r.countryCode === '6')?.priceMicro).toBe(100_000);
    expect(rows[0]!.priceMicro).toBe(300_000); // input untouched
    expect(rerouteListing(rows, 'tg')).toEqual(rows);
  });

  it('rerouteListing drops the USA when Canada has nothing to rent', () => {
    const out = rerouteListing([{ countryCode: '187', priceMicro: 300_000 }, { countryCode: '6', priceMicro: 1 }], 'wa');
    expect(out.map((r) => r.countryCode)).toEqual(['6']);
  });
});

describe('what each provider is actually asked for', () => {
  it.each([
    ['hero', () => new HeroSmsProvider({ baseUrl: 'https://hero.test/stubs/handler_api.php', apiKey: 'k' })],
    ['tiger', () => new TigerSmsProvider({ baseUrl: 'https://tiger.test/stubs/handler_api.php', apiKey: 'k' })],
    ['bower', () => new SmsBowerProvider({ baseUrl: 'https://bower.test/stubs/handler_api.php', apiKey: 'k', userId: '1' })],
  ])('%s buys a Canadian number for USA WhatsApp, and USA for anything else', async (_n, make) => {
    const calls = stub(() => NUMBER);
    const p = make();
    await p.rent({ serviceSlug: 'wa', countryCode: '187', dialCode: '', maxPriceMicro: 500_000 });
    await p.rent({ serviceSlug: 'tg', countryCode: '187', dialCode: '', maxPriceMicro: 500_000 });
    const buys = calls.filter((u) => u.searchParams.get('action') === 'getNumber');
    expect(buys.map((u) => u.searchParams.get('country'))).toEqual(['36', '187']);
  });

  it('bower prices USA WhatsApp from Canada, and its all-countries listing quotes Canada under the USA', async () => {
    const calls = stub(() => ({
      '36': { wa: { '1': { count: 9, price: 0.5, provider_id: 1 } } },
      '187': { wa: { '2': { count: 5, price: 0.3, provider_id: 2 } } },
    }));
    const p = new SmsBowerProvider({ baseUrl: 'https://bower.test/stubs/handler_api.php', apiKey: 'k', userId: '1' });
    await p.listPrices({ serviceCode: 'wa', countryCode: '187' });
    expect(calls[0]!.searchParams.get('country')).toBe('36');
    const all = await p.listPrices({ serviceCode: 'wa' });
    expect(all.filter((r) => r.countryCode === '187').map((r) => r.priceMicro)).toEqual([500_000]);
  });

  it('tiger prices USA WhatsApp from Canada (so the cap matches what is bought)', async () => {
    const calls = stub(() => ({ '36': { wa: { providers: { '1': { count: 9, price: [0.5], provider_id: 1 } } } } }));
    const p = new TigerSmsProvider({ baseUrl: 'https://tiger.test/stubs/handler_api.php', apiKey: 'k' });
    const rows = await p.listPrices({ serviceCode: 'wa', countryCode: '187' });
    expect(calls[0]!.searchParams.get('country')).toBe('36');
    expect(rows[0]!.priceMicro).toBe(500_000);
  });

  it('the all-countries listing quotes the price of the country that will be bought', async () => {
    stub(() => ({
      data: { wa: { '187': { map: { '0.30': 5 } }, '36': { map: { '0.50': 9 } }, '6': { map: { '0.10': 2 } } } },
    }));
    const p = new HeroSmsProvider({ baseUrl: 'https://hero.test/stubs/handler_api.php', apiKey: 'k' });
    const rows = await p.listPrices({ serviceCode: 'wa' });
    const us = rows.filter((r) => r.countryCode === '187');
    expect(us.map((r) => r.priceMicro)).toEqual([500_000]);
    expect(rows.some((r) => r.countryCode === '6')).toBe(true);
  });
});
