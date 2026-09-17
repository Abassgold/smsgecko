/**
 * Every field name here matches the real API's wire format exactly (see
 * apps/api/src/services/v2.mapper.ts#toV2Order in the SMSGecko repo) — no
 * camelCasing, so what you log or inspect from a raw response is identical
 * to what these types describe. The one deliberate exception is
 * `WaitForOtpResult` (see orders.ts), a synthesized convenience return value
 * that isn't a single API response body.
 */

export type OrderStatus = 'waiting' | 'completed' | 'canceled' | 'expired';

export interface OrderMessage {
  sender: string;
  text: string;
  received_at: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  product: { service: string; country: string };
  phone_number: string;
  /** Bare USD string, no symbol — e.g. "0.5". */
  price: string;
  otp_code: string | null;
  sms: OrderMessage[];
  created_at: string;
  expires_at: string;
  finished_at: string | null;
}

export interface CreateOrderParams {
  /** Either catalog_product_id or product_id — see "Create a product" / the
   * catalog listing for which one your integration uses. */
  catalog_product_id?: string;
  product_id?: string;
  operator_id?: string;
  /** Bare USD string, e.g. "0.50". Reject the order server-side if the
   * live price is above this. */
  max_price?: string;
  /** Always 1 today — reserved for future multi-number orders. */
  quantity?: number;
}

export interface CatalogProduct {
  id: string;
  service: string;
  service_slug: string;
  country: string;
  country_code: string;
  operator: string | null;
  /** Bare USD string, e.g. "0.50". */
  price: string;
  stock: number;
}

export interface ListProductsParams {
  service?: string;
  country?: string;
  /** 1–500, defaults to 200. */
  limit?: number;
}

export interface Balance {
  /** Bare USD string, no symbol. */
  balance: string;
}

export interface WebhookConfig {
  webhook_url: string | null;
  webhook_secret: string | null;
}

export interface SetWebhookParams {
  /** Pass `null` explicitly to clear the webhook (and its secret); omit to
   * leave the current URL as-is. */
  webhook_url?: string | null;
  /** 16–128 characters. */
  webhook_secret?: string;
  /** Replace the current secret with a fresh server-generated one. Ignored
   * if webhook_secret is also given — an explicit value always wins. */
  regenerate_secret?: boolean;
}

export interface WebhookTestResult {
  delivered: boolean;
  /** Note: camelCase on the wire here, unlike everything else in this API —
   * mirrored as-is rather than "corrected", since this type describes the
   * real response body. */
  statusCode: number | null;
  error?: string;
}
