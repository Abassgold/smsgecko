import type { ZodType } from 'zod';

/**
 * Parse a request part (body / query / params) against a Zod schema and return
 * the typed result. A `ZodError` propagates to the error handler in app.ts,
 * which turns it into a 400 `validation_error` response.
 *
 * Replaces Fastify's `{ schema: { body, querystring, params } }` +
 * `fastify-type-provider-zod`. Response schemas are intentionally not enforced —
 * the route mappers already produce the wire shapes.
 */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}
