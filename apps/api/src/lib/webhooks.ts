import { logger } from './logger.js';
import { hmacSha256Hex, randomToken } from './crypto.js';
import { badRequest } from './errors.js';
import type { UserDoc } from '../models/User.js';
import type { OrderDoc } from '../models/Order.js';
import { usdString } from '../services/v2.mapper.js';

export type WebhookEvent = 'order.created' | 'order.completed' | 'order.expired' | 'order.canceled';

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

function sign(secret: string | null | undefined, payload: string): string | null {
  return secret ? `sha256=${hmacSha256Hex(secret, payload)}` : null;
}

async function post(url: string, payload: string, signature: string | null) {
  return fetch(url, {
    method: 'POST',
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
    } else if (user.webhookUrl && !user.webhookSecret) {
      // First time a URL is set with no secret given — generate one so
      // signature verification works from the start.
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
