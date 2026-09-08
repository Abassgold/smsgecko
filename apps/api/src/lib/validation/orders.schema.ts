import * as yup from 'yup';
import { ORDER_STATUSES } from '@smsgecko/shared';
import type { OrdersStatusFilter } from '@smsgecko/shared';
import { paginationFields } from './common.schema.js';

export const createOrderBody = yup.object({
  /** The active provider's service / country codes (from the catalog endpoints). */
  serviceId: yup.string().trim().min(1).max(64).required(),
  countryId: yup.string().trim().min(1).max(64).required(),
  /** Refuse if the current price is above this (micro-USD, after markup). */
  maxPriceMicro: yup.number().integer().positive().optional(),
  /** Retry-safe create: same key for the same user returns the same order. */
  idempotencyKey: yup.string().trim().min(8).max(128).optional(),
});

const ORDER_STATUS_FILTERS = ['all', 'active', ...ORDER_STATUSES] as const;

export const ordersQuery = yup.object({
  status: yup
    .mixed<OrdersStatusFilter>()
    .oneOf([...ORDER_STATUS_FILTERS])
    .default('all'),
  ...paginationFields(100, 20),
});
export interface OrdersQuery {
  status: OrdersStatusFilter;
  page: number;
  limit: number;
}
