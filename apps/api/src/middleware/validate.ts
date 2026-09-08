import type { RequestHandler } from 'express';
import type { Schema } from 'yup';
import { badRequest } from '../lib/errors.js';

export type RequestPart = 'body' | 'query' | 'params';

/**
 * Validate one part of the request against a yup schema. The coerced result is
 * stashed on `req.valid[part]`; for `body` it is also written back to `req.body`
 * (Express 5 makes `req.query` / `req.params` read-only, so controllers read
 * those from `req.valid`). A yup `ValidationError` becomes a `bad_request`.
 */
export function validate(schema: Schema, part: RequestPart = 'body'): RequestHandler {
  return async (req, _res, next) => {
    try {
      const value = await schema.validate(req[part], {
        abortEarly: false,
        stripUnknown: true,
      });
      req.valid = { ...req.valid, [part]: value };
      if (part === 'body') req.body = value;
      next();
    } catch (err) {
      next(badRequest('Request validation failed', (err as { errors?: string[] }).errors));
    }
  };
}

export default validate;
