import { describe, expect, it, vi } from 'vitest';
import { SMSGeckoClient } from './client.js';
import { SMSGeckoError, SMSGeckoOrderFailedError, SMSGeckoTimeoutError } from './errors.js';
import type { Order } from './types.js';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord_1',
    status: 'waiting',
    product: { service: 'WhatsApp', country: 'United States' },
    phone_number: '+15551234567',
    price: '0.47',
    otp_code: null,
    sms: [],
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-01T00:20:00.000Z',
    finished_at: null,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('SMSGeckoClient', () => {
  it('sends the Bearer token and hits the real v2 path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: { balance: '12.50' } }));
    const client = new SMSGeckoClient({ token: 'smsg_live_test', baseUrl: 'https://api.example.com', fetch: fetchMock });

    const balance = await client.wallet.getBalance();

    expect(balance).toEqual({ balance: '12.50' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.com/api/v2/balance');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer smsg_live_test');
  });

  it('unwraps { success: true, data } for orders.create and sends an Idempotency-Key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { success: true, data: order() }));
    const client = new SMSGeckoClient({ token: 't', fetch: fetchMock });

    const created = await client.orders.create({ catalog_product_id: 'prod_1', max_price: '0.50' });

    expect(created.id).toBe('ord_1');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ catalog_product_id: 'prod_1', max_price: '0.50' });
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('respects an explicit idempotencyKey instead of generating one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { success: true, data: order() }));
    const client = new SMSGeckoClient({ token: 't', fetch: fetchMock });

    await client.orders.create({ catalog_product_id: 'prod_1' }, { idempotencyKey: 'my-key-12345' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('my-key-12345');
  });

  it('omits undefined query params rather than sending them as "undefined"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    const client = new SMSGeckoClient({ token: 't', baseUrl: 'https://api.example.com', fetch: fetchMock });

    await client.catalog.listProducts({ service: 'whatsapp' });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.com/api/v2/catalog/products?service=whatsapp');
  });

  it('throws SMSGeckoError with the real code/message/status on a { success: false } response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or revoked API key' } }),
      );
    const client = new SMSGeckoClient({ token: 'bad', fetch: fetchMock });

    const err = await client.wallet.getBalance().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SMSGeckoError);
    expect((err as SMSGeckoError).status).toBe(401);
    expect((err as SMSGeckoError).code).toBe('UNAUTHORIZED');
    expect((err as SMSGeckoError).message).toBe('Invalid or revoked API key');
  });

  it('carries validation details through on a 400', async () => {
    const details = ['catalog_product_id is required'];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
        }),
      );
    const client = new SMSGeckoClient({ token: 't', fetch: fetchMock });

    const err = await client.orders.create({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SMSGeckoError);
    expect((err as SMSGeckoError).code).toBe('VALIDATION_ERROR');
    expect((err as SMSGeckoError).details).toEqual(details);
  });

  describe('orders.waitForOtp', () => {
    it('returns as soon as otp_code appears, polling at intervalMs', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { success: true, data: order() }))
        .mockResolvedValueOnce(jsonResponse(200, { success: true, data: order() }))
        .mockResolvedValueOnce(jsonResponse(200, { success: true, data: order({ otp_code: '482913' }) }));
      const client = new SMSGeckoClient({ token: 't', fetch: fetchMock });

      const result = await client.orders.waitForOtp('ord_1', { intervalMs: 1, timeoutMs: 10_000 });

      expect(result).toEqual({ otpCode: '482913', order: order({ otp_code: '482913' }) });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('throws SMSGeckoOrderFailedError if the order expires before an OTP arrives', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: order({ status: 'expired' }) }));
      const client = new SMSGeckoClient({ token: 't', fetch: fetchMock });

      const err = await client.orders.waitForOtp('ord_1', { intervalMs: 1 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SMSGeckoOrderFailedError);
      expect((err as SMSGeckoOrderFailedError).status).toBe('expired');
    });

    it('throws SMSGeckoTimeoutError once timeoutMs elapses while still waiting', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: order() }));
      const client = new SMSGeckoClient({ token: 't', fetch: fetchMock });

      const err = await client.orders
        .waitForOtp('ord_1', { timeoutMs: 5, intervalMs: 10 })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SMSGeckoTimeoutError);
    });
  });
});
