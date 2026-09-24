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
  /** Without `service`: filter the service list by name/code (it can exceed `limit`). */
  search: yup.string().trim().max(100).optional(),
  country: yup.string().optional(),
  limit: yup.number().integer().min(1).max(500).default(200),
});
export interface ProductsQuery {
  service?: string;
  search?: string;
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

export const v2PatchWebhookBody = yup.object({
  // Explicit `null` clears the webhook (and its secret); omit to leave as-is.
  webhook_url: yup.string().url('webhook_url must be a valid URL').nullable().optional(),
  webhook_secret: yup.string().min(16, 'webhook_secret must be at least 16 characters').max(128).optional(),
  // Replace the current secret with a fresh server-generated one. Ignored if
  // webhook_secret is also given (an explicit value always wins).
  regenerate_secret: yup.boolean().optional(),
});
export interface V2PatchWebhookBody {
  webhook_url?: string | null;
  webhook_secret?: string;
  regenerate_secret?: boolean;
}
