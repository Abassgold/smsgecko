import type { Request, RequestHandler } from 'express';
import type { Schema } from 'yup';
import { badRequest } from '../lib/errors.js';

export type RequestPart = 'body' | 'query' | 'params';

const STORE = Symbol('validated');
type ValidStore = Partial<Record<RequestPart, unknown>>;

function store(req: Request): ValidStore {
  const holder = req as unknown as Record<symbol, ValidStore | undefined>;
  return (holder[STORE] ??= {});
}

/**
 * Validate one part of the request against a yup schema. The coerced result is
 * kept for the controller to read via `valid()`; for `body` it is also written
 * back to `req.body` (so a controller may read the body from either). A yup
 * `ValidationError` becomes a `bad_request`.
 */
export function validate(schema: Schema, part: RequestPart = 'body'): RequestHandler {
  return async (req, _res, next) => {
    try {
      const value = await schema.validate(req[part], {
        abortEarly: false,
        stripUnknown: true,
      });
      store(req)[part] = value;
      if (part === 'body') req.body = value;
      next();
    } catch (err) {
      next(badRequest('Request validation failed', (err as { errors?: string[] }).errors));
    }
  };
}

/**
 * Read a request part previously checked by `validate()`. Throws if the route is
 * missing the matching `validate(schema, part)` middleware.
 */
export function valid<T>(req: Request, part: RequestPart = 'body'): T {
  const value = store(req)[part];
  if (value === undefined) {
    throw new Error(
      `valid(): request '${part}' was not validated — add validate(schema, '${part}') to the route`,
    );
  }
  return value as T;
}

export default validate;
