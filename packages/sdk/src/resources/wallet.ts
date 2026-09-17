import type { HttpClient } from '../http-client.js';
import type { Balance } from '../types.js';

export class WalletResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /balance */
  getBalance(): Promise<Balance> {
    return this.http.request<Balance>('GET', '/balance');
  }
}
