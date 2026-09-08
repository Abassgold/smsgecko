export interface ApiKeyView {
  id: string;
  prefix: string;
  label: string;
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
}

/** Returned only once, at creation — includes the plaintext key. */
export interface ApiKeyCreated extends ApiKeyView {
  key: string;
}

export interface CreateApiKeyBody {
  label: string;
}

/* ---------- v2 public API ---------- */

export interface V2Product {
  id: string;
  service: string;
  service_slug: string;
  country: string;
  country_code: string;
  operator: string | null;
  /** USD, e.g. "0.50" */
  price: string;
  stock: number;
}

export interface V2CreateOrderBody {
  catalog_product_id?: string;
  product_id?: string;
  operator_id?: string;
  max_price?: string;
  quantity?: number;
}

export interface V2Order {
  id: string;
  status: 'waiting' | 'completed' | 'canceled' | 'expired';
  product: { service: string; country: string };
  phone_number: string;
  price: string;
  otp_code: string | null;
  sms: Array<{ sender: string; text: string; received_at: string }>;
  created_at: string;
  expires_at: string;
  finished_at: string | null;
}
