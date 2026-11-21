import type { Logger } from 'pino';
import { logger } from '../lib/logger.js';
import { Order, type OrderDoc } from '../models/Order.js';
import { Broadcast } from '../models/Broadcast.js';
import { User } from '../models/User.js';
import { applyOtpToOrder, cancelWithProvider, refundWaitingOrder, revertToCompleted } from '../lib/orderLifecycle.js';
import { isActivateStyle } from '../lib/providerPolicy.js';
import { CATALOG_SYNC_INTERVAL_MS, syncCatalog } from '../services/catalogSync.js';
import { getProviderForOrder } from '../providers/sms/registry.js';
import { getSettings } from '../lib/settings.js';
import { sendBroadcastEmail } from '../lib/email.js';
import { env } from '../config/env.js';

const POLL_INTERVAL_MS = 4_000;
const EXPIRY_INTERVAL_MS = 8_000;
const REAPER_INTERVAL_MS = 30_000;
const BATCH = 100;
/** Parallel provider polls per tick (manesms: 5 at a time). */
const POLL_CONCURRENCY = 5;
/** A provider that stays unreachable this long past the TTL no longer holds the customer's money (manesms: 10 min). */
const EXPIRY_PROVIDER_GRACE_MS = 10 * 60_000;
/** A purchase whose provider call never finished (crash, timeout): refund it rather than hold the money (manesms: 2 min). */
const PROVISIONING_STUCK_MS = 2 * 60_000;
/** How long a worker may hold a `sending` broadcast's lease before another
 * tick is free to reclaim it — see runBroadcasts() below. */
const BROADCAST_LEASE_MS = 30_000;

let timers: NodeJS.Timeout[] = [];

/** Run a job, skipping the tick if the previous run is still in flight. */
function guarded(fn: () => Promise<void>): () => void {
  let busy = false;
  return () => {
    if (busy) return;
    busy = true;
    // .catch() (not just .finally) so a tick that throws — e.g. a DB query
    // failing during a transient Mongo drop — is logged, never surfaced as an
    // unhandled rejection that would crash the process.
    void fn()
      .catch((err) => logger.error({ err }, 'worker tick failed'))
      .finally(() => {
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
  if (!order.providerRef) return { status: 'waiting', order }; // still being created
  const provider = await getProviderForOrder(order);
  const res = await provider.poll({ providerRef: order.providerRef, order });

  if (res.status === 'received') {
    // After "another SMS" the provider keeps answering with the previous code until the new one lands.
    if (res.code && order.otpHistory.includes(res.code)) {
      await Order.updateOne({ _id: order._id, status: 'waiting' }, { $set: { lastPolledAt: new Date() } });
      return { status: 'waiting', order };
    }
    const updated = await applyOtpToOrder(order, res.code, res.messages ?? []);
    // Tell the provider the activation is complete (status 6), as manesms does on delivery. Best effort.
    if (updated && isActivateStyle(order.provider)) void provider.finish?.(order.providerRef).catch(() => undefined);
    return { status: 'received', order: updated };
  }
  if (res.status === 'canceled') {
    // Waiting for a second SMS: the first was delivered and paid for, so never refund that.
    if (order.otpHistory.length > 0) {
      await revertToCompleted(order._id);
      return { status: 'canceled', order: await Order.findById(order._id) };
    }
    const refunded = await refundWaitingOrder(order._id, 'canceled');
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
    provisioning: { $ne: true },
    providerRef: { $ne: null },
    $or: [{ lastPolledAt: null }, { lastPolledAt: { $lte: staleBefore } }],
  }).limit(BATCH);

  const queue = [...due];
  const worker = async () => {
    for (let order = queue.shift(); order; order = queue.shift()) {
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
  };
  await Promise.all(Array.from({ length: POLL_CONCURRENCY }, worker));
}

/**
 * Expire waiting orders past their TTL and refund them. Same sequence as manesms: the provider is asked FIRST so we
 * get our money back there too; if the SMS landed at the last second the customer gets the code instead of a refund;
 * an order waiting for a SECOND sms is simply put back to `completed` (its first code was delivered and paid for).
 */
async function runExpiry(log: Logger): Promise<void> {
  const stale = await Order.find({
    status: 'waiting',
    provisioning: { $ne: true },
    expiresAt: { $lt: new Date() },
  }).limit(BATCH);

  for (const order of stale) {
    try {
      if (order.otpHistory.length > 0) {
        await revertToCompleted(order._id);
        continue;
      }
      try {
        const outcome = await cancelWithProvider(order, 'expired');
        if (outcome.kind === 'refunded' && outcome.order) log.info({ orderId: order.id }, 'order expired and refunded');
        else if (outcome.kind === 'received') log.info({ orderId: order.id }, 'code arrived at the last second — delivered, not refunded');
        // too_early: the provider still refuses; the next tick asks again.
      } catch (err) {
        // Provider unreachable: retry next tick, but don't keep the customer's money forever.
        if (Date.now() - order.expiresAt.getTime() < EXPIRY_PROVIDER_GRACE_MS) {
          log.warn({ err, orderId: order.id }, 'provider cancel failed at expiry, will retry');
          continue;
        }
        log.error({ err, orderId: order.id }, 'provider unreachable for 10 min past expiry — refunding anyway');
        await refundWaitingOrder(order._id, 'expired');
      }
    } catch (err) {
      log.error({ err, orderId: order.id }, 'order expiry failed');
    }
  }
}

/** A purchase whose provider call never finished (crash, timeout): give the held money back. */
async function runProvisioningReaper(log: Logger): Promise<void> {
  const stuck = await Order.find({
    provisioning: true,
    status: 'waiting',
    createdAt: { $lte: new Date(Date.now() - PROVISIONING_STUCK_MS) },
  }).limit(50);
  for (const order of stuck) {
    try {
      log.warn({ orderId: order.id }, 'refunding order stuck provisioning');
      await refundWaitingOrder(order._id, 'canceled');
      await Order.updateOne({ _id: order._id }, { $unset: { idempotencyKey: 1, idempotencyBodyHash: 1 } });
    } catch (err) {
      log.error({ err, orderId: order.id }, 'provisioning reaper failed');
    }
  }
}

/**
 * One batch of one broadcast per tick — same "pick up due work, process a
 * BROADCAST_BATCH_SIZE-sized slice, come back next tick" shape as runPolling/runExpiry
 * above, so a large recipient list can't block the event loop or one
 * worker tick for an unbounded amount of time. `Broadcast.cursor` makes
 * this resumable: each tick picks up exactly where the last one left off.
 */
export async function runBroadcasts(log: Logger): Promise<void> {
  const now = new Date();
  // Claim a freshly-queued job (oldest first), snapshotting its audience
  // size once, up front — or, if none is pending, atomically claim
  // whichever job is already in flight, via a short lease. That lease is
  // what stops two worker processes (e.g. horizontally-scaled API
  // instances) from ever both being mid-batch on the same broadcast at
  // once — a plain `findOne` here would find the same 'sending' job on
  // every process and let them all send the same batch. The lease is
  // released after every batch (below), so on a single process this never
  // waits — it's only ever contended across processes.
  let job =
    (await Broadcast.findOneAndUpdate(
      { status: 'pending' },
      { $set: { status: 'sending', startedAt: now, lockedUntil: new Date(now.getTime() + BROADCAST_LEASE_MS) } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    )) ??
    (await Broadcast.findOneAndUpdate(
      { status: 'sending', $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
      { $set: { lockedUntil: new Date(now.getTime() + BROADCAST_LEASE_MS) } },
      { returnDocument: 'after' },
    ));
  if (!job) return;

  // Only ever mail addresses that clicked their verification link (double opt-in),
  // whichever audience the admin picked — unverified addresses are where typos,
  // spam traps and hard bounces live.
  const audienceFilter: Record<string, unknown> = { unsubscribedFromBroadcasts: false, isVerified: true };

  if (job.totalRecipients === 0 && job.sentCount === 0 && job.failedCount === 0) {
    job.totalRecipients = await User.countDocuments(audienceFilter);
    await job.save();
  }

  try {
    const pageFilter = job.cursor ? { ...audienceFilter, _id: { $gt: job.cursor } } : audienceFilter;
    const recipients = await User.find(pageFilter).sort({ _id: 1 }).limit(env.BROADCAST_BATCH_SIZE).select('_id email');

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
        // `false` = on the suppression list; skipped, so counted as neither sent nor failed.
        if (await sendBroadcastEmail(user.email, String(user._id), job.subject, job.body)) sent += 1;
      } catch (err) {
        failed += 1;
        log.error({ err, userId: user.id, broadcastId: job.id }, 'broadcast send failed');
      }
    }

    await Broadcast.updateOne(
      { _id: job._id },
      {
        $inc: { sentCount: sent, failedCount: failed },
        // Release the lease immediately so the very next tick (same
        // process or another) can pick this job straight back up instead
        // of waiting out BROADCAST_LEASE_MS.
        $set: { cursor: recipients[recipients.length - 1]!._id, lockedUntil: null },
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

/** Refresh the stored catalog. A provider with nothing to sync (or none enabled) is not an error worth shouting about. */
async function runCatalogSync(log: Logger): Promise<void> {
  try {
    await syncCatalog();
  } catch (err) {
    log.warn({ err }, 'catalog sync skipped or failed');
  }
}

export { runExpiry, runProvisioningReaper };

export function startWorkers(log: Logger): void {
  stopWorkers();
  timers = [
    setInterval(guarded(() => runPolling(log)), POLL_INTERVAL_MS),
    setInterval(guarded(() => runExpiry(log)), EXPIRY_INTERVAL_MS),
    setInterval(guarded(() => runProvisioningReaper(log)), REAPER_INTERVAL_MS),
    setInterval(guarded(() => runCatalogSync(log)), CATALOG_SYNC_INTERVAL_MS),
    setInterval(guarded(() => runBroadcasts(log)), env.BROADCAST_INTERVAL_MS),
  ];
  for (const t of timers) t.unref?.();
  // First sync right away so a fresh start has real prices and stock to browse (does not block startup).
  void runCatalogSync(log);
  log.info('background workers started (provider polling + order expiry + broadcasts)');
}

export function stopWorkers(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
}
