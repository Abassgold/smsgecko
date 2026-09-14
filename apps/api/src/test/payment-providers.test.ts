import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  verifyStripeSignature,
  parseStripeEvent,
} from '../providers/payment/stripe.js';
import {
  verifyNowPaymentsSignature,
  parseNowPaymentsEvent,
} from '../providers/payment/nowpayments.js';
import { verifyKorapaySignature, parseKorapayEvent } from '../providers/payment/korapay.js';
import { verifyAndParseCryptomusEvent } from '../providers/payment/cryptomus.js';

const SECRET = 'whsec_test_secret';

function signStripe(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('stripe webhook verification', () => {
  it('accepts a correctly signed payload', () => {
    const body = JSON.stringify({ type: 'checkout.session.completed' });
    const header = signStripe(body, SECRET);
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET)).toBe(true);
  });

  it('rejects a payload signed with the wrong secret', () => {
    const body = JSON.stringify({ type: 'checkout.session.completed' });
    const header = signStripe(body, 'wrong-secret');
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ type: 'checkout.session.completed', amount: 100 });
    const header = signStripe(body, SECRET);
    const tampered = JSON.stringify({ type: 'checkout.session.completed', amount: 999999 });
    expect(verifyStripeSignature(Buffer.from(tampered), header, SECRET)).toBe(false);
  });

  it('rejects a stale timestamp (replay)', () => {
    const body = JSON.stringify({ type: 'checkout.session.completed' });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const header = signStripe(body, SECRET, oldTimestamp);
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyStripeSignature(Buffer.from('{}'), undefined, SECRET)).toBe(false);
  });

  it('parses a checkout.session.completed event', () => {
    const event = parseStripeEvent({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', payment_status: 'paid' } },
    });
    expect(event).toEqual({ providerRef: 'cs_test_123', paid: true });
  });

  it('ignores unrelated event types', () => {
    expect(parseStripeEvent({ type: 'payment_intent.created', data: {} })).toBeNull();
  });
});

const IPN_SECRET = 'np_ipn_test_secret';

function signNowPayments(body: Record<string, unknown>, secret: string): string {
  const sortedKeys = Object.keys(body).sort();
  const sorted = Object.fromEntries(sortedKeys.map((k) => [k, body[k]]));
  return createHmac('sha512', secret).update(JSON.stringify(sorted)).digest('hex');
}

describe('nowpayments IPN verification', () => {
  it('accepts a correctly signed payload regardless of key order', () => {
    const body = { payment_status: 'finished', invoice_id: 'inv_1', price_amount: 10 };
    const header = signNowPayments(body, IPN_SECRET);
    expect(verifyNowPaymentsSignature(body, header, IPN_SECRET)).toBe(true);
  });

  it('rejects a payload signed with the wrong secret', () => {
    const body = { payment_status: 'finished', invoice_id: 'inv_1' };
    const header = signNowPayments(body, 'wrong-secret');
    expect(verifyNowPaymentsSignature(body, header, IPN_SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyNowPaymentsSignature({}, undefined, IPN_SECRET)).toBe(false);
  });

  it('parses a paid IPN event', () => {
    const event = parseNowPaymentsEvent({ invoice_id: 'inv_1', payment_status: 'finished' });
    expect(event).toEqual({ providerRef: 'inv_1', paid: true });
  });

  it('treats an unfinished status as not paid', () => {
    const event = parseNowPaymentsEvent({ invoice_id: 'inv_1', payment_status: 'waiting' });
    expect(event).toEqual({ providerRef: 'inv_1', paid: false });
  });
});

const KORAPAY_SECRET = 'kora_sk_test_secret';

function signKorapay(data: unknown, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
}

describe('korapay webhook verification', () => {
  it('accepts a correctly signed data object', () => {
    const data = { reference: 'dep_1', status: 'success', amount: 1000 };
    const header = signKorapay(data, KORAPAY_SECRET);
    expect(verifyKorapaySignature(data, header, KORAPAY_SECRET)).toBe(true);
  });

  it('rejects a payload signed with the wrong secret', () => {
    const data = { reference: 'dep_1', status: 'success' };
    const header = signKorapay(data, 'wrong-secret');
    expect(verifyKorapaySignature(data, header, KORAPAY_SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyKorapaySignature({}, undefined, KORAPAY_SECRET)).toBe(false);
  });

  it('parses a successful charge event', () => {
    const event = parseKorapayEvent({
      event: 'charge.success',
      data: { reference: 'dep_1', status: 'success' },
    });
    expect(event).toEqual({ providerRef: 'dep_1', paid: true });
  });

  it('treats a failed charge as not paid', () => {
    const event = parseKorapayEvent({
      event: 'charge.failed',
      data: { reference: 'dep_1', status: 'failed' },
    });
    expect(event).toEqual({ providerRef: 'dep_1', paid: false });
  });
});

const CRYPTOMUS_API_KEY = 'cryptomus_test_api_key';

function signCryptomus(payload: Record<string, unknown>, apiKey: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return createHash('md5').update(encoded + apiKey).digest('hex');
}

describe('cryptomus webhook verification', () => {
  it('accepts a correctly signed paid event', () => {
    const rest = { order_id: 'dep_1', status: 'paid', amount: '10.00' };
    const sign = signCryptomus(rest, CRYPTOMUS_API_KEY);
    const event = verifyAndParseCryptomusEvent({ ...rest, sign }, CRYPTOMUS_API_KEY);
    expect(event).toEqual({ providerRef: 'dep_1', paid: true });
  });

  it('treats paid_over as paid too', () => {
    const rest = { order_id: 'dep_1', status: 'paid_over' };
    const sign = signCryptomus(rest, CRYPTOMUS_API_KEY);
    const event = verifyAndParseCryptomusEvent({ ...rest, sign }, CRYPTOMUS_API_KEY);
    expect(event?.paid).toBe(true);
  });

  it('rejects a payload signed with the wrong key', () => {
    const rest = { order_id: 'dep_1', status: 'paid' };
    const sign = signCryptomus(rest, 'wrong-key');
    expect(verifyAndParseCryptomusEvent({ ...rest, sign }, CRYPTOMUS_API_KEY)).toBeNull();
  });

  it('rejects a missing sign', () => {
    expect(verifyAndParseCryptomusEvent({ order_id: 'dep_1', status: 'paid' }, CRYPTOMUS_API_KEY)).toBeNull();
  });

  it('rejects a tampered field', () => {
    const rest = { order_id: 'dep_1', status: 'paid', amount: '10.00' };
    const sign = signCryptomus(rest, CRYPTOMUS_API_KEY);
    const tampered = { ...rest, amount: '99.00', sign };
    expect(verifyAndParseCryptomusEvent(tampered, CRYPTOMUS_API_KEY)).toBeNull();
  });
});
