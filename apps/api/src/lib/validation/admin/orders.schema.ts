import * as yup from 'yup';
import { ORDER_STATUSES } from '@smsgecko/shared';
import type { OrdersStatusFilter } from '@smsgecko/shared';
import { objectId, paginationFields } from '../common.schema.js';

const ORDER_STATUS_FILTERS = ['all', 'active', ...ORDER_STATUSES] as const;

export const adminOrdersQuery = yup.object({
  status: yup
    .mixed<OrdersStatusFilter>()
    .oneOf([...ORDER_STATUS_FILTERS])
    .default('all'),
  provider: yup.string().trim().max(60).optional(),
  serviceId: objectId.optional(),
  countryId: objectId.optional(),
  userId: objectId.optional(),
  q: yup.string().trim().max(120).optional(),
  ...paginationFields(100, 25),
});
export interface AdminOrdersQuery {
  status: OrdersStatusFilter;
  provider?: string;
  serviceId?: string;
  countryId?: string;
  userId?: string;
  q?: string;
  page: number;
  limit: number;
}
