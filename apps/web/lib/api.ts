import type { ErrorResponse } from '@smsgecko/shared';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, body: ErrorResponse['error'] | { message?: string }) {
    super(body.message ?? 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = 'code' in body && body.code ? body.code : 'error';
    this.details = 'details' in body ? body.details : undefined;
  }
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  /** Forwarded cookie header for server-side calls. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: 'no-store',
  });

  const text = await res.text();
  const json = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const errBody =
      json && typeof json === 'object' && 'error' in json
        ? (json as ErrorResponse).error
        : { message: text || res.statusText };
    throw new ApiError(res.status, errBody);
  }

  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
