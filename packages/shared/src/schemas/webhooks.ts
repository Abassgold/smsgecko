export interface WebhookConfig {
  webhookUrl: string | null;
  webhookSecret: string | null;
}

export interface UpdateWebhookBody {
  /** `null` clears the webhook (and its secret). Omit to leave unchanged. */
  webhookUrl?: string | null;
  /** Omit to auto-generate on first set, or to leave an existing one unchanged. */
  webhookSecret?: string;
  /** Replace the current secret with a fresh server-generated one. Ignored if webhookSecret is also given. */
  regenerateSecret?: boolean;
}

export interface WebhookTestResult {
  delivered: boolean;
  statusCode: number | null;
  error?: string;
}
