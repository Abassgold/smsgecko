import type { Logger } from 'pino';
import { Order, type OrderDoc } from '../models/Order.js';
import { Broadcast } from '../models/Broadcast.js';
import { User } from '../models/User.js';
import { applyOtpToOrder, refundWaitingOrder } from '../lib/orderLifecycle.js';
import { getProviderForOrder } from '../providers/sms/registry.js';
import { getSettings } from '../lib/settings.js';
import { sendBroadcastEmail } from '../lib/email.js';

const POLL_INTERVAL_MS = 4_000;
const EXPIRY_INTERVAL_MS = 8_000;
const BROADCAST_INTERVAL_MS = 5_000;
const BATCH = 50;

let timers: NodeJS.Timeout[] = [];

/** Run a job, skipping the tick if the previous run is still in flight. */
function guarded(fn: () => Promise<void>): () => void {
  let busy = false;
  return () => {
    if (busy) return;
    busy = true;
    void fn().finally(() => {
      busy = false;
    });
  };
}

/**
 * Ask the order's provider for its status once and act on the result.
 * Shared by the polling worker and the admin "re-poll" action.
 */
export async function pollOrderOnce(
  order: OrderDoc,
): Promise<{ status: 'waiting' | 'received' | 'canceled'; order: OrderDoc | null }> {
  const provider = await getProviderForOrder(order);
  const res = await provider.poll({ providerRef: order.providerRef, order });

  if (res.status === 'received') {
    const updated = await applyOtpToOrder(order, res.code, res.messages ?? []);
    return { status: 'received', order: updated };
  }
  if (res.status === 'canceled') {
    const refunded = await refundWaitingOrder(order._id, 'expired');
    return { status: 'canceled', order: refunded };
  }
  await Order.updateOne({ _id: order._id, status: 'waiting' }, { $set: { lastPolledAt: new Date() } });
  return { status: 'waiting', order };
}

async function runPolling(log: Logger): Promise<void> {
  const { providerPollIntervalMs } = await getSettings();
  const staleBefore = new Date(Date.now() - providerPollIntervalMs);

  const due = await Order.find({
    status: 'waiting',
    $or: [{ lastPolledAt: null }, { lastPolledAt: { $lte: staleBefore } }],
  }).limit(BATCH);

  for (const order of due) {
    try {
      const { status, order: updated } = await pollOrderOnce(order);
      if (status === 'received') {
        log.info({ orderId: updated?.id, otp: updated?.otpCode, provider: order.provider }, 'OTP delivered');
      } else if (status === 'canceled') {
        log.info({ orderId: order.id, provider: order.provider }, 'provider canceled — refunded');
      }
    } catch (err) {
      log.error({ err, orderId: order.id, provider: order.provider }, 'poll failed');
    }
  }
}

async function runExpiry(log: Logger): Promise<void> {
  const stale = await Order.find({
    status: 'waiting',
    expiresAt: { $lt: new Date() },
  }).limit(BATCH);

  for (const order of stale) {
    try {
      const expired = await refundWaitingOrder(order._id, 'expired');
      if (expired) log.info({ orderId: expired.id }, 'order expired and refunded');
    } catch (err) {
      log.error({ err, orderId: order.id }, 'order expiry failed');
    }
  }
}

/**
 * One batch of one broadcast per tick — same "pick up due work, process a
 * BATCH-sized slice, come back next tick" shape as runPolling/runExpiry
 * above, so a large recipient list can't block the event loop or one
 * worker tick for an unbounded amount of time. `Broadcast.cursor` makes
 * this resumable: each tick picks up exactly where the last one left off.
 */
export async function runBroadcasts(log: Logger): Promise<void> {
  // Claim a freshly-queued job (snapshot its audience size once, up front)
  // if there is one; otherwise continue whichever job is already in flight.
  let job =
    (await Broadcast.findOneAndUpdate(
      { status: 'pending' },
      { $set: { status: 'sending', startedAt: new Date() } },
      { returnDocument: 'after' },
    )) ?? (await Broadcast.findOne({ status: 'sending' }));
  if (!job) return;

  const audienceFilter: Record<string, unknown> = { unsubscribedFromBroadcasts: false };
  if (job.audience === 'verified') audienceFilter.isVerified = true;

  if (job.totalRecipients === 0 && job.sentCount === 0 && job.failedCount === 0) {
    job.totalRecipients = await User.countDocuments(audienceFilter);
    await job.save();
  }

  try {
    const pageFilter = job.cursor ? { ...audienceFilter, _id: { $gt: job.cursor } } : audienceFilter;
    const recipients = await User.find(pageFilter).sort({ _id: 1 }).limit(BATCH).select('_id email');

    if (recipients.length === 0) {
      await Broadcast.updateOne({ _id: job._id }, { $set: { status: 'completed', completedAt: new Date() } });
      log.info(
        { broadcastId: job.id, sent: job.sentCount, failed: job.failedCount },
        'broadcast completed',
      );
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const user of recipients) {
      try {
        await sendBroadcastEmail(user.email, String(user._id), job.subject, job.body);
        sent += 1;
      } catch (err) {
        failed += 1;
        log.error({ err, userId: user.id, broadcastId: job.id }, 'broadcast send failed');
      }
    }

    await Broadcast.updateOne(
      { _id: job._id },
      {
        $inc: { sentCount: sent, failedCount: failed },
        $set: { cursor: recipients[recipients.length - 1]!._id },
      },
    );
  } catch (err) {
    // A failure outside the per-recipient try/catch (e.g. the User query
    // itself) shouldn't leave the job silently stuck in 'sending' forever.
    log.error({ err, broadcastId: job.id }, 'broadcast batch failed');
    await Broadcast.updateOne(
      { _id: job._id },
      { $set: { status: 'failed', error: err instanceof Error ? err.message : String(err) } },
    );
  }
}

export function startWorkers(log: Logger): void {
  stopWorkers();
  timers = [
    setInterval(guarded(() => runPolling(log)), POLL_INTERVAL_MS),
    setInterval(guarded(() => runExpiry(log)), EXPIRY_INTERVAL_MS),
    setInterval(guarded(() => runBroadcasts(log)), BROADCAST_INTERVAL_MS),
  ];
  for (const t of timers) t.unref?.();
  log.info('background workers started (provider polling + order expiry + broadcasts)');
}

export function stopWorkers(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
}
