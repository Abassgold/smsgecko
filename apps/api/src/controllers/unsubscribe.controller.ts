import { asyncHandler } from '../lib/asyncHandler.js';
import { env } from '../config/env.js';
import { verifyUnsubscribeToken } from '../lib/broadcastUnsubscribe.js';
import { User } from '../models/User.js';

async function applyUnsubscribe(token: unknown): Promise<void> {
  const userId = verifyUnsubscribeToken(typeof token === 'string' ? token : '');
  if (userId) {
    await User.updateOne({ _id: userId }, { $set: { unsubscribedFromBroadcasts: true } });
  }
}

/**
 * Public, no auth, no login required — this is what a one-click unsubscribe
 * link in an email client actually hits. Token carries and verifies its own
 * identity (see lib/broadcastUnsubscribe.ts), so there's nothing to check a
 * session against even if the recipient never signs in on this device.
 */
export const unsubscribe = asyncHandler(async (req, res) => {
  await applyUnsubscribe(req.query.token);
  // Redirect either way — an invalid/expired token still lands on a normal
  // page rather than a raw JSON error, which is what a real inbox click
  // expects to see.
  res.redirect(302, `${env.APP_URL}/unsubscribed`);
});

/**
 * RFC 8058 one-click: broadcasts carry `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
 * so Gmail/Yahoo's own "Unsubscribe" button POSTs to the same URL (token still in
 * the query string) instead of opening it. It expects a plain 2xx, not a redirect.
 */
export const unsubscribeOneClick = asyncHandler(async (req, res) => {
  await applyUnsubscribe(req.query.token);
  res.status(200).json({ ok: true as const });
});
