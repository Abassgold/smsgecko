import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { hmacSha256Hex, randomToken } from './crypto.js';
import { badRequest } from './errors.js';
import type { UserDoc } from '../models/User.js';
import type { OrderDoc } from '../models/Order.js';
import { usdString } from '../services/v2.mapper.js';

export type WebhookEvent = 'order.created' | 'order.otp_received' | 'order.expired' | 'order.canceled';

const SIGNATURE_HEADER = 'X-SMSGecko-Signature';
const DELIVERY_TIMEOUT_MS = 5000;

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // link-local — covers cloud metadata endpoints (169.254.169.254)
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
];

/**
 * Reject the obvious SSRF targets (localhost, private/link-local ranges) and
 * anything not HTTPS. This is a hostname-string check, not a DNS-resolved one —
 * it won't catch DNS rebinding to a private IP behind a public hostname. Good
 * enough for a first pass; revisit if webhook URLs become admin-configurable
 * for other users' infra rather than the account owner's own endpoint.
 */
export function isSafeWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return !PRIVATE_HOSTNAME_PATTERNS.some((p) => p.test(url.hostname));
}

/** True for loopback / private / link-local / ULA / CGNAT addresses (v4 + v6). */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number) as [number, number, number, number];
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local (metadata)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateIp(mapped[1]!);
    return false;
  }
  return true; // unparseable → treat as unsafe
}

/**
 * Resolve `hostname` and reject if any address is private/link-local. Called
 * right before every outbound webhook POST, so a hostname that passed the
 * set-time string check but *resolves* to an internal IP (DNS rebinding) is
 * still blocked. Residual TOCTOU: undici re-resolves on connect, so a value
 * that flips between this lookup and the socket connect isn't fully closed —
 * pinning the socket to the resolved IP would be the complete fix.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  // Tests deliver to a local 127.0.0.1 sink on purpose; the check is a prod
  // guard. The pure isPrivateIp() logic is unit-tested directly instead.
  if (env.NODE_ENV === 'test') return;
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('webhook host is a private address');
    return;
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new Error('webhook host did not resolve');
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('webhook host resolves to a private address');
  }
}

function sign(secret: string | null | undefined, payload: string): string | null {
  return secret ? `sha256=${hmacSha256Hex(secret, payload)}` : null;
}

async function post(url: string, payload: string, signature: string | null) {
  // Re-check the resolved IP at send time (DNS rebinding), and never follow a
  // redirect — a 3xx into http://169.254.169.254/… or an internal host would
  // otherwise bypass the set-time URL check.
  await assertPublicHost(new URL(url).hostname);
  return fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'SMSGecko-Webhooks/1.0',
      ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
    },
    body: payload,
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
}

export interface WebhookOrderData {
  order_id: string;
  status: OrderDoc['status'];
  phone_number: string;
  otp_code: string | null;
  otp_message: string | null;
  service: string;
  country: string;
  price: string;
  created_at: string;
  expires_at: string;
  finished_at: string | null;
}

/**
 * Flat, single-level shape for the `data` field of a webhook delivery — kept
 * separate from `toV2Order()` (used by GET/POST /orders) so the two can vary
 * independently: this one is the wire contract customers' receivers parse,
 * that one is the REST resource shape.
 */
function toWebhookData(order: OrderDoc, otpMessage: string | null = null): WebhookOrderData {
  return {
    order_id: order.id as string,
    status: order.status,
    phone_number: order.phoneNumber,
    otp_code: order.otpCode ?? null,
    otp_message: otpMessage,
    service: order.serviceName,
    country: order.countryName,
    price: usdString(order.priceMicro),
    created_at: (order.get('createdAt') as Date).toISOString(),
    expires_at: order.expiresAt.toISOString(),
    finished_at: order.finishedAt ? order.finishedAt.toISOString() : null,
  };
}

/**
 * Best-effort webhook delivery: one POST, short timeout, no retry queue. A
 * no-op when the user hasn't configured a webhook. Never throws — a broken or
 * slow customer endpoint must not affect the order flow that triggered this.
 */
export async function dispatchWebhook(
  user: UserDoc,
  event: WebhookEvent,
  order: OrderDoc,
  otpMessage: string | null = null,
): Promise<void> {
  if (!user.webhookUrl) return;

  const payload = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: toWebhookData(order, otpMessage),
  });

  try {
    const res = await post(user.webhookUrl, payload, sign(user.webhookSecret, payload));
    if (!res.ok) {
      logger.warn({ userId: user.id, event, status: res.status }, 'webhook delivery failed');
    }
  } catch (err) {
    logger.warn({ userId: user.id, event, err }, 'webhook delivery error');
  }
}

export interface WebhookPatch {
  /** `null` clears the webhook (and its secret); `undefined` leaves it as-is. */
  webhookUrl?: string | null;
  webhookSecret?: string;
  /** Replace the current secret with a fresh one. Ignored if webhookSecret is also given. */
  regenerateSecret?: boolean;
}

/**
 * Apply a partial webhook config update to `user` in place and save it — the
 * one place this logic lives, so the v1 (session) and v2 (Bearer) controllers
 * can't drift on validation or the auto-generate-a-secret behavior. Does not
 * respond; callers shape their own response envelope.
 */
export async function applyWebhookPatch(user: UserDoc, patch: WebhookPatch): Promise<void> {
  if (patch.webhookUrl === null) {
    user.webhookUrl = null;
    user.webhookSecret = null;
  } else {
    if (patch.webhookUrl !== undefined) {
      if (!isSafeWebhookUrl(patch.webhookUrl)) {
        throw badRequest('webhookUrl must be an https:// URL, not a local or private address');
      }
      user.webhookUrl = patch.webhookUrl;
    }
    if (patch.webhookSecret !== undefined) {
      user.webhookSecret = patch.webhookSecret;
    } else if (user.webhookUrl && (patch.regenerateSecret || !user.webhookSecret)) {
      // Either an explicit rotation, or the first time a URL is set with no
      // secret given — generate one so signature verification works from the
      // start.
      user.webhookSecret = randomToken(24);
    }
  }
  await user.save();
}

export interface TestWebhookResult {
  delivered: boolean;
  statusCode: number | null;
  error?: string;
}

/** Sends a synthetic `webhook.test` event to the user's configured URL right now. */
export async function sendTestWebhook(user: UserDoc): Promise<TestWebhookResult> {
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    event: 'webhook.test',
    timestamp: now,
    data: {
      order_id: '000000000000000000000000',
      status: 'completed',
      phone_number: '+15551234567',
      otp_code: '482913',
      otp_message: 'Your WhatsApp code: 482-913',
      service: 'Whatsapp',
      country: 'United States',
      price: '0.47',
      created_at: now,
      expires_at: now,
      finished_at: null,
    } satisfies WebhookOrderData,
  });

  try {
    const res = await post(user.webhookUrl!, payload, sign(user.webhookSecret, payload));
    return { delivered: res.ok, statusCode: res.status };
  } catch (err) {
    return { delivered: false, statusCode: null, error: err instanceof Error ? err.message : 'request failed' };
  }
}
