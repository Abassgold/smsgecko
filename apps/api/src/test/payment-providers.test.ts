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
import { verifyBachsSignature, parseBachsEvent } from '../providers/payment/bachs.js';
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

  it('does not treat "confirmed" as paid — funds haven\'t reached our wallet yet', () => {
    // Per NOWPayments' own status docs: confirmed = enough blockchain
    // confirmations, but the payout to us is still "sending". Only
    // "finished" means the funds actually arrived.
    const event = parseNowPaymentsEvent({ invoice_id: 'inv_1', payment_status: 'confirmed' });
    expect(event).toEqual({ providerRef: 'inv_1', paid: false });
  });
});

const BACHS_SECRET = 'bachs_whsec_test_secret';

function signBachs(
  rawBody: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('bachs webhook verification', () => {
  it('accepts a correctly signed payload', () => {
    const body = JSON.stringify({ type: 'collection.succeeded' });
    const header = signBachs(body, BACHS_SECRET);
    expect(verifyBachsSignature(Buffer.from(body), header, BACHS_SECRET)).toBe(true);
  });

  it('rejects a payload signed with the wrong secret', () => {
    const body = JSON.stringify({ type: 'collection.succeeded' });
    const header = signBachs(body, 'wrong-secret');
    expect(verifyBachsSignature(Buffer.from(body), header, BACHS_SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ type: 'collection.succeeded', amount: '10.00' });
    const header = signBachs(body, BACHS_SECRET);
    const tampered = JSON.stringify({ type: 'collection.succeeded', amount: '999999.00' });
    expect(verifyBachsSignature(Buffer.from(tampered), header, BACHS_SECRET)).toBe(false);
  });

  it('rejects a stale timestamp (replay)', () => {
    const body = JSON.stringify({ type: 'collection.succeeded' });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const header = signBachs(body, BACHS_SECRET, oldTimestamp);
    expect(verifyBachsSignature(Buffer.from(body), header, BACHS_SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyBachsSignature(Buffer.from('{}'), undefined, BACHS_SECRET)).toBe(false);
  });

  it('accepts a match against any v1= entry during a secret rotation', () => {
    // X-Bachs-Signature-V2 can carry more than one v1= while a secret
    // rotation is in its 24h overlap window — only one needs to match.
    const body = JSON.stringify({ type: 'collection.succeeded' });
    const timestamp = Math.floor(Date.now() / 1000);
    const oldSig = createHmac('sha256', 'previous-secret')
      .update(`${timestamp}.${body}`)
      .digest('hex');
    const newSig = createHmac('sha256', BACHS_SECRET).update(`${timestamp}.${body}`).digest('hex');
    const header = `t=${timestamp},v1=${oldSig},v1=${newSig}`;
    expect(verifyBachsSignature(Buffer.from(body), header, BACHS_SECRET)).toBe(true);
  });

  it('parses a collection.succeeded event as paid', () => {
    const event = parseBachsEvent({
      type: 'collection.succeeded',
      data: { checkout_id: 'chk_1', status: 'succeeded' },
    });
    expect(event).toEqual({ providerRef: 'chk_1', paid: true });
  });

  it('treats collection.failed as not paid', () => {
    const event = parseBachsEvent({
      type: 'collection.failed',
      data: { checkout_id: 'chk_1', status: 'failed' },
    });
    expect(event).toEqual({ providerRef: 'chk_1', paid: false });
  });

  it('treats collection.underpaid as not paid', () => {
    const event = parseBachsEvent({
      type: 'collection.underpaid',
      data: { checkout_id: 'chk_1' },
    });
    expect(event).toEqual({ providerRef: 'chk_1', paid: false });
  });

  it('ignores unrelated event types', () => {
    expect(parseBachsEvent({ type: 'checkout.completed', data: { checkout_id: 'chk_1' } })).toBeNull();
  });
});

const CRYPTOMUS_API_KEY = 'cryptomus_test_api_key';

// Mirrors Cryptomus's own PHP-side json_encode, which escapes forward
// slashes — a real webhook (e.g. a txid or url field) can contain one.
function signCryptomus(payload: Record<string, unknown>, apiKey: string): string {
  const json = JSON.stringify(payload).replace(/\//g, '\\/');
  const encoded = Buffer.from(json).toString('base64');
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

  it('verifies correctly when a field contains a slash (their signature escapes it, ours must too)', () => {
    // A real payload field with a "/" — e.g. Cryptomus's own txid/url fields
    // can contain one. Their PHP-side json_encode escapes it before
    // signing; a naive JSON.stringify on our side would silently produce a
    // different signature and always reject the webhook.
    const rest = { order_id: 'dep_1', status: 'paid', txid: 'abc/def' };
    const sign = signCryptomus(rest, CRYPTOMUS_API_KEY);
    const event = verifyAndParseCryptomusEvent({ ...rest, sign }, CRYPTOMUS_API_KEY);
    expect(event).toEqual({ providerRef: 'dep_1', paid: true });
  });
});
