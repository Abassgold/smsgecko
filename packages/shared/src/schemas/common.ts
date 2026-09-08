import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';

/** Resolved pagination inputs (after defaults/coercion on the API side). */
export interface PaginationQuery {
  page: number;
  limit: number;
}

/** Standard list envelope returned by every paginated endpoint. */
export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface OkResponse {
  ok: true;
}

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
