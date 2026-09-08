import * as yup from 'yup';
import { DEFAULT_PAGE_SIZE } from '@smsgecko/shared';

/** Mongo ObjectId as a 24-char hex string. */
export const objectId = yup
  .string()
  .trim()
  .matches(/^[a-f0-9]{24}$/i, 'invalid id');

/** `/:id` route params. */
export const idParams = yup.object({
  id: objectId.required(),
});
export interface IdParams {
  id: string;
}

/**
 * Standard `?page=&limit=` pagination. `max` differs per endpoint, so callers
 * pass their own limit ceiling.
 */
export function paginationFields(maxLimit = 100, defaultLimit: number = DEFAULT_PAGE_SIZE) {
  return {
    page: yup.number().integer().min(1).default(1),
    limit: yup.number().integer().min(1).max(maxLimit).default(defaultLimit),
  };
}

export interface Pagination {
  page: number;
  limit: number;
}

/**
 * A free-form JSON object that keeps all of its keys (unlike a shaped
 * `yup.object()`, which the global `stripUnknown` would empty out). Used for
 * provider adapter config blobs.
 */
export const configObject = yup
  .mixed<Record<string, unknown>>()
  .test(
    'plain-object',
    'must be a JSON object',
    (v) => v == null || (typeof v === 'object' && !Array.isArray(v)),
  );

