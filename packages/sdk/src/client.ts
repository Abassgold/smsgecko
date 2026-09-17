import { HttpClient, type SMSGeckoClientOptions } from './http-client.js';
import { OrdersResource } from './resources/orders.js';
import { CatalogResource } from './resources/catalog.js';
import { WalletResource } from './resources/wallet.js';
import { WebhookResource } from './resources/webhook.js';

export type { SMSGeckoClientOptions } from './http-client.js';

/**
 * Client for the SMSGecko API (`/api/v2`). Holds a Bearer API key, so use
 * this server-side only — never in a browser or mobile app bundle.
 *
 * @example
 * ```ts
 * const client = new SMSGeckoClient({ token: process.env.SMSGECKO_TOKEN! });
 *
 * const order = await client.orders.create({
 *   catalog_product_id: process.env.SMSGECKO_CATALOG_PRODUCT_ID,
 *   max_price: "0.50",
 * });
 *
 * const { otpCode } = await client.orders.waitForOtp(order.id, { timeoutMs: 120_000 });
 * console.log(otpCode);
 * await client.orders.finish(order.id);
 * ```
 */
export class SMSGeckoClient {
  readonly orders: OrdersResource;
  readonly catalog: CatalogResource;
  readonly wallet: WalletResource;
  readonly webhook: WebhookResource;

  constructor(options: SMSGeckoClientOptions) {
    const http = new HttpClient(options);
    this.orders = new OrdersResource(http);
    this.catalog = new CatalogResource(http);
    this.wallet = new WalletResource(http);
    this.webhook = new WebhookResource(http);
  }
}
