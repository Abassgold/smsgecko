import { logger } from './logger.js';
import { hmacSha256Hex } from './crypto.js';
import type { UserDoc } from '../models/User.js';
import type { OrderDoc } from '../models/Order.js';
import { toV2Order } from '../services/v2.mapper.js';

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

/**
 * Best-effort webhook delivery: one POST, short timeout, no retry queue. A
 * no-op when the user hasn't configured a webhook. Never throws — a broken or
 * slow customer endpoint must not affect the order flow that triggered this.
 */
export async function dispatchWebhook(
  user: UserDoc,
  event: WebhookEvent,
  order: OrderDoc,
): Promise<void> {
  if (!user.webhookUrl) return;

  const payload = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: toV2Order(order),
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

export interface TestWebhookResult {
  delivered: boolean;
  statusCode: number | null;
  error?: string;
}

/** Sends a synthetic `webhook.test` event to the user's configured URL right now. */
export async function sendTestWebhook(user: UserDoc): Promise<TestWebhookResult> {
  const payload = JSON.stringify({
    event: 'webhook.test',
    timestamp: new Date().toISOString(),
    data: {
      id: '000000000000000000000000',
      status: 'completed',
      product: { service: 'Whatsapp', country: 'United States' },
      phone_number: '+15551234567',
      price: '0.47',
      otp_code: '482913',
      sms: [{ sender: 'WhatsApp', text: 'Your WhatsApp code: 482-913', received_at: new Date().toISOString() }],
      created_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
      finished_at: null,
    },
  });

  try {
    const res = await post(user.webhookUrl!, payload, sign(user.webhookSecret, payload));
    return { delivered: res.ok, statusCode: res.status };
  } catch (err) {
    return { delivered: false, statusCode: null, error: err instanceof Error ? err.message : 'request failed' };
  }
}
