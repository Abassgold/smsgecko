import { z } from 'zod';

export const apiKeyView = z.object({
  id: z.string(),
  prefix: z.string(),
  label: z.string(),
  lastUsedAt: z.string().nullable(),
  revoked: z.boolean(),
  createdAt: z.string(),
});
export type ApiKeyView = z.infer<typeof apiKeyView>;

/** Returned only once, at creation — includes the plaintext key. */
export const apiKeyCreated = apiKeyView.extend({ key: z.string() });
export type ApiKeyCreated = z.infer<typeof apiKeyCreated>;

export const createApiKeyBody = z.object({
  label: z.string().trim().min(1).max(60).default('API key'),
});

/* ---------- v2 public API ---------- */

export const v2Product = z.object({
  id: z.string(),
  service: z.string(),
  service_slug: z.string(),
  country: z.string(),
  country_code: z.string(),
  operator: z.string().nullable(),
  price: z.string(), // USD, e.g. "0.50"
  stock: z.number().int(),
});

export const v2CreateOrderBody = z.object({
  catalog_product_id: z.string().optional(),
  product_id: z.string().optional(),
  operator_id: z.string().optional(),
  max_price: z.string().optional(),
  quantity: z.number().int().min(1).max(1).optional(),
});
export type V2CreateOrderBody = z.infer<typeof v2CreateOrderBody>;

export const v2Order = z.object({
  id: z.string(),
  status: z.enum(['waiting', 'completed', 'canceled', 'expired']),
  product: z.object({ service: z.string(), country: z.string() }),
  phone_number: z.string(),
  price: z.string(),
  otp_code: z.string().nullable(),
  sms: z.array(
    z.object({ sender: z.string(), text: z.string(), received_at: z.string() }),
  ),
  created_at: z.string(),
  expires_at: z.string(),
  finished_at: z.string().nullable(),
});
export type V2Order = z.infer<typeof v2Order>;