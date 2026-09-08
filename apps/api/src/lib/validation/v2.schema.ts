import * as yup from 'yup';

export const v2IdParams = yup.object({
  id: yup
    .string()
    .matches(/^[a-f0-9]{24}$/i, 'invalid id')
    .required(),
});

/** `Idempotency-Key` header — optional, 8–128 chars when present. */
export const idempotencyHeader = yup.string().min(8).max(128).optional();

export const productsQuery = yup.object({
  service: yup.string().optional(),
  country: yup.string().optional(),
  limit: yup.number().integer().min(1).max(500).default(200),
});
export interface ProductsQuery {
  service?: string;
  country?: string;
  limit: number;
}

export const v2CreateOrderBody = yup.object({
  catalog_product_id: yup.string().optional(),
  product_id: yup.string().optional(),
  operator_id: yup.string().optional(),
  max_price: yup.string().optional(),
  quantity: yup.number().integer().min(1).max(1).optional(),
});
