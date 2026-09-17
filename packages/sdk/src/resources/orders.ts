import { randomUUID } from 'node:crypto';
import type { HttpClient } from '../http-client.js';
import { SMSGeckoOrderFailedError, SMSGeckoTimeoutError } from '../errors.js';
import type { CreateOrderParams, Order } from '../types.js';

export interface WaitForOtpOptions {
  /** Give up and throw SMSGeckoTimeoutError after this many milliseconds.
   * Defaults to 120000 (2 minutes). */
  timeoutMs?: number;
  /** Delay between polls, in milliseconds. Defaults to 3000. */
  intervalMs?: number;
}

export interface WaitForOtpResult {
  /** The OTP code that arrived. */
  otpCode: string;
  /** The order as of the poll that found it. */
  order: Order;
}

export class OrdersResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * POST /orders — reserves a virtual number for the given product.
   * `idempotencyKey` makes retrying a failed request safe: a repeated key
   * within its window returns the original order instead of creating a
   * second one. A fresh one is generated for you if you don't pass one.
   */
  create(params: CreateOrderParams, options: { idempotencyKey?: string } = {}): Promise<Order> {
    return this.http.request<Order>('POST', '/orders', {
      body: params,
      idempotencyKey: options.idempotencyKey ?? randomUUID(),
    });
  }

  /** GET /orders/:id */
  get(id: string): Promise<Order> {
    return this.http.request<Order>('GET', `/orders/${encodeURIComponent(id)}`);
  }

  /** GET /orders/active — every order of yours still in the `waiting` state. */
  listActive(): Promise<Order[]> {
    return this.http.request<Order[]>('GET', '/orders/active');
  }

  /** POST /orders/:id/finish — releases the number and settles the charge.
   * Call this once you've read the OTP and are done with the number. */
  finish(id: string): Promise<Order> {
    return this.http.request<Order>('POST', `/orders/${encodeURIComponent(id)}/finish`);
  }

  /** POST /orders/:id/cancel — cancels before an OTP arrives (refunds if eligible). */
  cancel(id: string): Promise<Order> {
    return this.http.request<Order>('POST', `/orders/${encodeURIComponent(id)}/cancel`);
  }

  /** POST /orders/:id/resend — asks the provider to resend the SMS to the same number. */
  resend(id: string): Promise<Order> {
    return this.http.request<Order>('POST', `/orders/${encodeURIComponent(id)}/resend`);
  }

  /** POST /orders/:id/reactivate — requests a second code on the same
   * number, after the first one already arrived. */
  reactivate(id: string): Promise<Order> {
    return this.http.request<Order>('POST', `/orders/${encodeURIComponent(id)}/reactivate`);
  }

  /**
   * Polls GET /orders/:id until `otp_code` is set, the order leaves
   * `waiting` some other way (throws SMSGeckoOrderFailedError if it's
   * canceled/expired), or `timeoutMs` elapses (throws SMSGeckoTimeoutError).
   *
   * This is a convenience helper, not a single API call — `{ otpCode }` is
   * this SDK's one deliberate exception to "types match the wire format
   * exactly" (see types.ts): it's kept camelCase because that's the
   * ergonomic shape you actually want out of a polling loop, not something
   * mapped 1:1 from a single response body.
   */
  async waitForOtp(id: string, options: WaitForOtpOptions = {}): Promise<WaitForOtpResult> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const intervalMs = options.intervalMs ?? 3_000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const order = await this.get(id);
      if (order.otp_code) return { otpCode: order.otp_code, order };
      if (order.status === 'canceled' || order.status === 'expired') {
        throw new SMSGeckoOrderFailedError(id, order.status);
      }
      if (Date.now() + intervalMs > deadline) {
        throw new SMSGeckoTimeoutError(id, timeoutMs);
      }
      await sleep(intervalMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
