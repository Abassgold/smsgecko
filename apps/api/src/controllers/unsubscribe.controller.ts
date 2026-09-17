import { asyncHandler } from '../lib/asyncHandler.js';
import { env } from '../config/env.js';
import { verifyUnsubscribeToken } from '../lib/broadcastUnsubscribe.js';
import { User } from '../models/User.js';

/**
 * Public, no auth, no login required — this is what a one-click unsubscribe
 * link in an email client actually hits. Token carries and verifies its own
 * identity (see lib/broadcastUnsubscribe.ts), so there's nothing to check a
 * session against even if the recipient never signs in on this device.
 */
export const unsubscribe = asyncHandler(async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const userId = verifyUnsubscribeToken(token);
  if (userId) {
    await User.updateOne({ _id: userId }, { $set: { unsubscribedFromBroadcasts: true } });
  }
  // Redirect either way — an invalid/expired token still lands on a normal
  // page rather than a raw JSON error, which is what a real inbox click
  // expects to see.
  res.redirect(302, `${env.APP_URL}/unsubscribed`);
});
