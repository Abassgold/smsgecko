import * as webpushNs from 'web-push';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { PushSubscription } from '../models/PushSubscription.js';

// web-push is CommonJS: depending on the loader its API sits on the namespace or on `default`.
const webpush = ((webpushNs as { default?: typeof webpushNs }).default ?? webpushNs) as typeof webpushNs;

/** Read on every call (not once at import) so a changed key is picked up and tests can switch it on. */
export const pushEnabled = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(userId: string, sub: SubscriptionInput) {
  // The same device can switch accounts: the endpoint is unique, so re-point it at the current user.
  await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    { $set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
    { upsert: true },
  );
}

export async function removeSubscription(userId: string, endpoint: string) {
  await PushSubscription.deleteOne({ userId, endpoint });
}

/** Sends one notification to a stored subscription. Split out so tests can replace the network call. */
export const sender = {
  send: (sub: { endpoint: string; p256dh: string; auth: string }, data: string) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, data, {
      TTL: 300,
      vapidDetails: { subject: env.VAPID_SUBJECT ?? env.WEB_ORIGIN, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! },
    }),
};

/**
 * Tell every device the user opted in on. Fire-and-forget: never throws and never blocks the order that triggered it.
 * Resolves when the sends are done, so tests can wait for it.
 */
export function notifyUser(userId: string, payload: { title: string; body: string; url: string; tag?: string }): Promise<void> {
  if (!pushEnabled()) return Promise.resolve();
  return (async () => {
    const subs = await PushSubscription.find({ userId });
    const data = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await sender.send(s, data);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await PushSubscription.deleteOne({ _id: s._id }); // the device unsubscribed
          else logger.warn({ err }, '[push] send failed');
        }
      }),
    );
  })().catch((err) => logger.error({ err }, '[push] notify failed'));
}
