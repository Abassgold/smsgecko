import request from 'supertest';
import type { Application } from 'express';

export interface InjectOptions {
  method: string;
  url: string;
  payload?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
}

export interface InjectResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  text: string;
  json: () => any;
  cookies: Array<{ name: string; value: string }>;
}

/**
 * A `fastify.inject()`-shaped wrapper over supertest, so the test suite reads
 * the same after the Express port. Returns `{ statusCode, json(), cookies, ... }`.
 */
export function makeInject(app: Application) {
  return async (opts: InjectOptions): Promise<InjectResponse> => {
    const method = opts.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head';
    let req = request(app)[method](opts.url);
    if (opts.query) req = req.query(opts.query);
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers)) req = req.set(k, v);
    }
    if (opts.payload !== undefined) req = req.send(opts.payload as object);

    const res = await req;
    const rawSetCookie = res.headers['set-cookie'];
    const setCookies: string[] = Array.isArray(rawSetCookie)
      ? rawSetCookie
      : rawSetCookie
        ? [rawSetCookie]
        : [];

    return {
      statusCode: res.status,
      headers: res.headers,
      body: res.body,
      text: res.text,
      json: () => res.body,
      cookies: setCookies.map((c) => {
        const pair = c.split(';', 1)[0] ?? '';
        const eq = pair.indexOf('=');
        return { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
      }),
    };
  };
}
