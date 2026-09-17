import type { HttpClient } from '../http-client.js';
import type { CatalogProduct, ListProductsParams } from '../types.js';

export class CatalogResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /catalog/products — omit `service` to get the list of services
   * themselves (one row each, no country/price yet); pass it to get the
   * countries/prices available for that service. */
  listProducts(params: ListProductsParams = {}): Promise<CatalogProduct[]> {
    return this.http.request<CatalogProduct[]>('GET', '/catalog/products', {
      query: { service: params.service, country: params.country, limit: params.limit },
    });
  }
}
