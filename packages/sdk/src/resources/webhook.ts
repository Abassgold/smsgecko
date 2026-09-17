import type { HttpClient } from '../http-client.js';
import type { SetWebhookParams, WebhookConfig, WebhookTestResult } from '../types.js';

export class WebhookResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /webhook — your currently configured webhook URL/secret. */
  get(): Promise<WebhookConfig> {
    return this.http.request<WebhookConfig>('GET', '/webhook');
  }

  /** PATCH /webhook — set or clear your webhook URL, and/or rotate its secret. */
  set(params: SetWebhookParams): Promise<WebhookConfig> {
    return this.http.request<WebhookConfig>('PATCH', '/webhook', { body: params });
  }

  /** POST /webhook/test — sends a synthetic `webhook.test` event to your
   * configured URL right now. Throws if no webhook_url is set yet. */
  test(): Promise<WebhookTestResult> {
    return this.http.request<WebhookTestResult>('POST', '/webhook/test');
  }
}
