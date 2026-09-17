import { SMSGeckoError } from './errors.js';

export interface SMSGeckoClientOptions {
  /** Your API key — a Bearer token starting with `smsg_live_`. Create one
   * from the SMSGecko dashboard under Settings > API Key (only one is
   * active at a time; generating a new one revokes the old one). */
  token: string;
  /**
   * Base URL of the SMSGecko API. Defaults to the local dev server
   * (`http://localhost:4000`) — there is no public production API host
   * yet, so pass this explicitly once one exists.
   */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number;
  /** Override the fetch implementation — mainly for tests. Defaults to the
   * runtime's global `fetch`. */
  fetch?: typeof fetch;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

/**
 * Thin wrapper over the real /api/v2 wire format — every response is
 * `{ success, data }` or `{ success: false, error }` (see
 * apps/api/src/controllers/v2.controller.ts#ok / v2ErrorHandler in the
 * SMSGecko repo). Resource classes (OrdersResource etc.) call `request()`
 * and get back the unwrapped `data`, or a thrown SMSGeckoError.
 */
export class HttpClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SMSGeckoClientOptions) {
    if (!options.token) throw new Error('SMSGeckoClient requires a `token`');
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? 'http://localhost:4000').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    options: {
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v2${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    let payload: Envelope<T>;
    try {
      payload = (await res.json()) as Envelope<T>;
    } catch {
      throw new SMSGeckoError(res.status, 'INVALID_RESPONSE', 'Response body was not valid JSON');
    }

    if (!res.ok || !payload.success) {
      const err = payload.error ?? {
        code: 'UNKNOWN_ERROR',
        message: `Request failed with status ${res.status}`,
      };
      throw new SMSGeckoError(res.status, err.code, err.message, err.details);
    }

    return payload.data as T;
  }
}
