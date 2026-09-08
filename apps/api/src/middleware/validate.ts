import type { RequestHandler } from 'express';
import type { Schema } from 'yup';
import { badRequest } from '../lib/errors.js';

export type RequestPart = 'body' | 'query' | 'params';

/**
 * Validate one part of the request against a yup schema. The coerced/defaulted
 * result is stashed on `req.valid[part]`; for `body` it is also written back to
 * `req.body`. `req.query` / `req.params` are read-only getters in Express 5, so
 * controllers must read those from `req.valid`.
 *
 * A yup `ValidationError` is converted into the app's `bad_request` shape.
 */
export const validate =
  (schema: Schema, part: RequestPart = 'body'): RequestHandler =>
  async (req, _res, next) => {
    try {
      const value = await schema.validate(req[part], {
        abortEarly: false,
        stripUnknown: true,
      });
      (req.valid ??= {})[part] = value;
      if (part === 'body') req.body = value;
      next();
    } catch (err) {
      const errors = (err as { errors?: string[] }).errors;
      next(badRequest('Request validation failed', errors));
    }
  };

export default validate;
