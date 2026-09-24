import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupCountry } from '../lib/countryLookup.js';
import { parseActivateCountries } from '../providers/sms/adapters/activateProtocol.js';
import { SmsCodeProvider } from '../providers/sms/adapters/smsCode.js';
import { SmsPoolProvider } from '../providers/sms/adapters/smsPool.js';

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

describe('smscode catalog', () => {
  const provider = new SmsCodeProvider({ baseUrl: 'https://api.smscode.test/v2', apiKey: 'k' });

  it('names services from /catalog/services and drops inactive ones', async () => {
    stubFetch(() => ({
      success: true,
      data: [
        { id: 1, code: 'whatsapp', name: 'WhatsApp', active: true },
        { id: 9, code: 'old', name: 'Retired', active: false },
      ],
    }));
    expect(await provider.listServices()).toEqual([{ code: '1', name: 'WhatsApp' }]);
  });

  it('reads iso2 and dial_code from /catalog/countries', async () => {
    stubFetch(() => ({
      success: true,
      data: [
        { id: 7, code: 'ID', name: 'Indonesia', dial_code: '+62', active: true },
        { id: 8, code: 'XX', name: 'Gone', dial_code: '+1', active: false },
      ],
    }));
    expect(await provider.listCountries()).toEqual([
      { code: '7', name: 'Indonesia', iso2: 'id', dialCode: '62' },
    ]);
  });

  it('pages through /catalog/products and maps available -> stock', async () => {
    const product = (id: number) => ({
      id,
      country_id: 2,
      platform_id: 1,
      available: 5000,
      price: { amount: '0.0429', currency: 'USD' },
      active: true,
      operator_name: null,
    });
    const pages: Record<string, unknown[]> = {
      '1': Array.from({ length: 1000 }, (_, i) => product(i)),
      '2': [product(5000), product(5001)],
    };
    stubFetch((url) => ({ success: true, data: pages[url.searchParams.get('page') ?? ''] ?? [] }));

    const rows = await provider.listPrices({ serviceCode: '1' });
    expect(rows).toHaveLength(1002);
    expect(rows[0]).toEqual({
      serviceCode: '1',
      countryCode: '2',
      priceMicro: 42_900,
      stock: 5000,
      operator: null,
    });
  });
});

describe('smscode rent', () => {
  it('sends max_price with headroom over the product price (IDR rounding)', async () => {
    const provider = new SmsCodeProvider({ baseUrl: 'https://api.smscode.test/v2', apiKey: 'k' });
    let sent: Record<string, unknown> = {};
    stubFetch((url, body) => {
      if (url.pathname.endsWith('/orders/create')) {
        sent = JSON.parse(body);
        return { success: true, data: { orders: [{ id: 15338774, phone_number: '380759272473' }] } };
      }
      return {
        success: true,
        data: [
          { id: 1370178905, catalog_product_id: 1, available: 5000, active: true, price: { amount: '0.0429' } },
          { id: 1, catalog_product_id: 2, available: 0, active: true, price: { amount: '0.0100' } }, // sold out
        ],
      };
    });

    const r = await provider.rent({ serviceSlug: '1', countryCode: '2', dialCode: '380' });
    expect(sent.catalog_product_id).toBe(1); // the sold-out cheaper slot is skipped
    expect(Number(sent.max_price)).toBeGreaterThan(0.0429);
    expect(Number(sent.max_price)).toBeLessThan(0.0429 * 1.05);
    expect(r).toEqual({ providerRef: '15338774', phoneNumber: '+380759272473', costMicro: 42_900 });
  });
});

describe('smspool catalog', () => {
  const provider = new SmsPoolProvider({ baseUrl: 'https://api.smspool.test', apiKey: 'k' });

  it('maps cc -> dialCode and strips the virtual suffix from short_name', async () => {
    stubFetch(() => [
      { ID: 1, name: 'United States', short_name: 'US', cc: '1' },
      { ID: 22, name: 'United States (Virtual)', short_name: 'US_V', cc: '1' },
    ]);
    expect(await provider.listCountries()).toEqual([
      { code: '1', name: 'United States', iso2: 'us', dialCode: '1' },
      { code: '22', name: 'United States (Virtual)', iso2: 'us', dialCode: '1' },
    ]);
  });

  it('keeps stock on a single-country price lookup', async () => {
    stubFetch((url) =>
      url.pathname === '/request/success_rate'
        ? [
            { country_id: 1, price: '2.01', low_price: '1.44', stock: 1256 },
            { country_id: 2, price: '3.00', low_price: '1.80', stock: 1 },
          ]
        : {},
    );
    expect(await provider.listPrices({ serviceCode: '1012', countryCode: '1' })).toEqual([
      { serviceCode: '1012', countryCode: '1', priceMicro: 1_440_000, stock: 1256 },
      { serviceCode: '1012', countryCode: '1', priceMicro: 2_010_000, stock: 1256 },
    ]);
  });
});
