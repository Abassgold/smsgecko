import * as yup from 'yup';
import { ORDER_STATUSES } from '@smsgecko/shared';
import type { OrdersStatusFilter } from '@smsgecko/shared';
import { objectId, paginationFields } from './common.schema.js';

export const createOrderBody = yup.object({
  serviceId: objectId.required(),
  countryId: objectId.required(),
  /** Pin a specific offer; otherwise the cheapest in-stock one is used. */
  offerId: objectId.optional(),
  /** Refuse if the chosen offer costs more than this (micro-USD). */
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
