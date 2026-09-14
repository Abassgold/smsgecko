import type { UserDoc } from '../models/User.js';
import type { ApiKeyDoc } from '../models/ApiKey.js';

declare global {
  namespace Express {
    interface Request {
      /** Populated by `attachUser` from the access-token cookie; null when anonymous. */
      authUser: UserDoc | null;
      /** Populated by `requireApiKey` on /api/v2 routes. */
      apiUser: UserDoc | null;
      apiKeyDoc: ApiKeyDoc | null;
      /** Raw request body bytes, captured by the `express.json()` verify callback — needed for Stripe webhook signature checks. */
      rawBody?: Buffer;
    }
  }
}

export {};
