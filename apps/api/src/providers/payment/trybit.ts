import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { Charge, CreateChargeInput, PaymentProvider } from './index.js';

/*
 * Trybit hosted crypto checkout. Ported from Mane SMS, where it is the only gateway.
 *  - We create an invoice and send the customer to its hosted page; the balance changes only when Trybit says it was paid.
 *  - A postback only says "invoice X changed" (and proves it with a signed token). We never trust its body: we read the
 *    invoice back from Trybit and act on that (see applyTrybitInvoice in services/deposits.service.ts).
 *  - What we credit is `received_usd` (what arrived after Trybit's fees), never the invoice value.
 */
export const trybitEnabled = () => !!(env.TRYBIT_API_KEY && env.TRYBIT_SHOP_ID);

export class TrybitError extends Error {}

/** Every Trybit answer is `{ status: 'success' | 'error', result }`. */
async function call<T>(path: string, body: unknown): Promise<T> {
  if (!env.TRYBIT_API_KEY) throw new TrybitError('TRYBIT_API_KEY is not set');
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${env.TRYBIT_BASE_URL}${path}`, {
      method: 'POST',
      headers: { authorization: `Token ${env.TRYBIT_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    text = await res.text();
  } catch (err) {
    throw new TrybitError(`Trybit unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
  let json: { status?: string; result?: T };
  try {
    json = JSON.parse(text);
  } catch {
    throw new TrybitError(`Trybit ${res.status} returned non-JSON: ${text.slice(0, 80)}`);
  }
  if (!res.ok || json.status !== 'success' || json.result == null) throw new TrybitError(`Trybit ${res.status}: ${text.slice(0, 200)}`);
  return json.result;
}

/** The invoice fields we use. Same shape from `invoice/create` and `invoice/merchant/info`. */
export interface TrybitInvoice {
  uuid: string;
  status: string;
  link?: string;
  order_id?: string | null;
  /** The invoice value in USD, and what has been credited so far. */
  amount_usd?: number | string;
  received_usd?: number | string | null;
  /** Amount in the coin the customer chose. */
  amount?: number | string | null;
  currency?: string | { code?: string } | null;
  test_mode?: boolean;
  /** Blockchain transaction ids of the payment(s). */
  tx_list?: string[] | null;
}

export const INVOICE_LIFETIME_MS = 2 * 60 * 60 * 1000;
/** Customers can only pay in USDT (a stablecoin), on any network Trybit supports. */
const AVAILABLE_CURRENCIES = ['USDT_TRC20', 'USDT_ERC20', 'USDT_BSC', 'USDT_SOL', 'USDT_TON', 'USDT_ARB', 'USDT_OPT'];

/** Create a hosted checkout for `amountUsd`. */
export async function createInvoice(input: { amountUsd: number; orderId: string; email?: string }): Promise<{ id: string; invoiceUrl: string }> {
  if (!env.TRYBIT_SHOP_ID) throw new TrybitError('TRYBIT_SHOP_ID is not set');
  const r = await call<TrybitInvoice>('/v2/invoice/create', {
    shop_id: env.TRYBIT_SHOP_ID,
    amount: input.amountUsd,
    currency: 'USD',
    order_id: input.orderId,
    ...(input.email ? { email: input.email } : {}),
    add_fields: { time_to_pay: { hours: INVOICE_LIFETIME_MS / 3_600_000, minutes: 0 }, available_currencies: AVAILABLE_CURRENCIES },
  });
  if (!r.uuid || !r.link) throw new TrybitError('Trybit did not return an invoice');
  return { id: r.uuid, invoiceUrl: r.link };
}

/** The current state of one invoice, by `INV-XXXXXXXX` id. */
export async function getInvoice(uuid: string): Promise<TrybitInvoice> {
  const id = /^INV-/i.test(uuid) ? uuid : `INV-${uuid}`;
  const list = await call<TrybitInvoice[] | TrybitInvoice>('/v2/invoice/merchant/info', { uuids: [id] });
  const found = (Array.isArray(list) ? list : [list]).find((i) => i?.uuid?.toUpperCase() === id.toUpperCase());
  if (!found) throw new TrybitError(`Trybit has no invoice ${id}`);
  return found;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/**
 * The `token` in a postback is a JWT signed HS256 with the project's secret key, valid for 5 minutes. Returns its
 * claims when the signature and time window check out, otherwise null. Any algorithm other than HS256 is refused.
 */
export function verifyPostbackToken(token: unknown): Record<string, unknown> | null {
  const secret = env.TRYBIT_SECRET_KEY;
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  try {
    if ((JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string }).alg !== 'HS256') return null;
    const want = createHmac('sha256', secret).update(`${h}.${p}`).digest();
    const got = Buffer.from(s, 'base64url');
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;
    const now = Date.now() / 1000;
    const LEEWAY = 30;
    if (typeof claims.exp === 'number' && now > claims.exp + LEEWAY) return null;
    if (typeof claims.nbf === 'number' && now < claims.nbf - LEEWAY) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Sign claims the way Trybit does. Used by tests to build a valid postback. */
export function signPostbackToken(claims: Record<string, unknown>, secret: string) {
  const h = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64url(Buffer.from(JSON.stringify(claims)));
  return `${h}.${p}.${b64url(createHmac('sha256', secret).update(`${h}.${p}`).digest())}`;
}

export class TrybitProvider implements PaymentProvider {
  readonly name = 'trybit';

  async createCharge(input: CreateChargeInput): Promise<Charge> {
    const orderId = `dep_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    try {
      const invoice = await createInvoice({ amountUsd: Number((input.amountMicro / 1_000_000).toFixed(2)), orderId, email: input.userEmail });
      return { providerRef: invoice.id, payAddress: null, payUrl: invoice.invoiceUrl, expiresAt: new Date(Date.now() + INVOICE_LIFETIME_MS) };
    } catch (err) {
      // Logged for us; the customer gets a clean, generic message: the gateway's own text is not ours to show.
      logger.warn({ err }, 'trybit invoice create failed');
      throw badRequest('Could not start a Trybit payment. Please try again.');
    }
  }
}
