import type { RequestHandler } from 'express';
import { ApiKey } from '../models/ApiKey.js';
import { User } from '../models/User.js';
import { unauthorized } from '../lib/errors.js';

/**
 * Middleware for /api/v2: require a valid `Authorization: Bearer smsg_live_…` key.
 * Sets `req.apiUser` / `req.apiKeyDoc`.
 */
export const requireApiKey: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return next(unauthorized('Missing Bearer token'));

  ApiKey.verify(match[1]!.trim())
    .then(async (key) => {
      if (!key) throw unauthorized('Invalid or revoked API key');
      const user = await User.findById(key.userId);
      if (!user) throw unauthorized('Invalid API key');

      key.lastUsedAt = new Date();
      void key.save();

      req.apiKeyDoc = key;
      req.apiUser = user;
      next();
    })
    .catch(next);
};
