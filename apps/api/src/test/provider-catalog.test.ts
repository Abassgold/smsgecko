import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupCountry } from '../lib/countryLookup.js';
import { parseActivateCountries } from '../providers/sms/adapters/activateProtocol.js';
import { TigerSmsProvider } from '../providers/sms/adapters/tigerSms.js';

// Response shapes below are trimmed copies of what the live APIs returned (2026-09-24).

function stubFetch(route: (url: URL, body: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      const json = route(url, String(init?.body ?? ''));
      return new Response(JSON.stringify(json), { status: 200 });
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('lookupCountry', () => {
  it.each([
    ['USA', 'us', '1'],
    ['United States (virtual)', 'us', '1'],
    ['Russian Federation', 'ru', '7'],
    ['Congo (Dem. Republic)', 'cd', '243'],
    ['DR Congo', 'cd', '243'],
    ['Congo', 'cg', '242'],
    ['Cote d`Ivoire Ivory Coast', 'ci', '225'],
    ['Turkey', 'tr', '90'],
    ['Germany', 'de', '49'], // not the retired DD code
    ['Myanmar', 'mm', '95'], // not the retired BU code
  ])('%s -> %s / +%s', (name, iso2, dialCode) => {
    expect(lookupCountry(name)).toEqual({ iso2, dialCode });
  });

  it('returns nothing for an unknown name', () => {
    expect(lookupCountry('Atlantis')).toEqual({});
  });
});

describe('SMS-Activate getCountries (hero-sms / smsbower)', () => {
  it('derives iso2 + dial code from the English name', () => {
    const rows = parseActivateCountries({
      '1': { id: 1, rus: 'Украина', eng: 'Ukraine', chn: '乌克兰', visible: 1 },
      '12': { id: '12', eng: 'United States (virtual)' },
    });
    expect(rows).toEqual([
      { code: '1', name: 'Ukraine', iso2: 'ua', dialCode: '380' },
      { code: '12', name: 'United States (virtual)', iso2: 'us', dialCode: '1' },
    ]);
  });
});

describe('tiger-sms catalog + status', () => {
  const provider = new TigerSmsProvider({ baseUrl: 'https://api.tiger.test/stubs/handler_api.php', apiKey: 'k' });

  it('reads one tier per operator from getPricesV3 (nested providers, array prices)', async () => {
    stubFetch(() => ({
      '187': {
        wa: {
          price: 0.313,
          count: 112895,
          providers: {
            '14': { count: 95708, price: [0.3], provider_id: 14 },
            '22': { count: 17187, price: [0.45], provider_id: 22 },
          },
        },
      },
    }));
    const rows = await provider.listPrices({ serviceCode: 'wa', countryCode: '187' });
    expect(rows).toEqual([
      { serviceCode: 'wa', countryCode: '187', priceMicro: 300_000, stock: 95708, operator: '14' },
      { serviceCode: 'wa', countryCode: '187', priceMicro: 450_000, stock: 17187, operator: '22' },
    ]);
  });

  it('falls back to getPrices when no country is given (V3 needs one)', async () => {
    stubFetch((url) => {
      expect(url.searchParams.get('action')).toBe('getPrices');
      return { '6': { wa: { cost: '0.3000', count: 136994 } } };
    });
    const rows = await provider.listPrices({ serviceCode: 'wa' });
    expect(rows).toEqual([
      { serviceCode: 'wa', countryCode: '6', priceMicro: 300_000, stock: 136994 },
    ]);
  });

  it('keeps 19-digit ids as strings and treats ACCESS_CANCEL as canceled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        const action = url.searchParams.get('action');
        if (action === 'getNumber') return new Response('ACCESS_NUMBER:1234567890123456789:14155550123');
        return new Response('ACCESS_CANCEL');
      }),
    );
    const rent = await provider.rent({ serviceSlug: 'wa', countryCode: '187', dialCode: '1' });
    expect(rent.providerRef).toBe('1234567890123456789');
    expect(rent.phoneNumber).toBe('+14155550123');
    expect(await provider.poll({ providerRef: rent.providerRef } as never)).toEqual({ status: 'canceled' });
  });
});
