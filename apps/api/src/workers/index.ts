import type { Logger } from 'pino';
import { Order, type OrderDoc } from '../models/Order.js';
import { applyOtpToOrder, refundWaitingOrder } from '../lib/orderLifecycle.js';
import { getProviderForOrder } from '../providers/sms/registry.js';
import { getSettings } from '../lib/settings.js';

const POLL_INTERVAL_MS = 4_000;
const EXPIRY_INTERVAL_MS = 8_000;
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

export function startWorkers(log: Logger): void {
  stopWorkers();
  timers = [
    setInterval(guarded(() => runPolling(log)), POLL_INTERVAL_MS),
    setInterval(guarded(() => runExpiry(log)), EXPIRY_INTERVAL_MS),
  ];
  for (const t of timers) t.unref?.();
  log.info('background workers started (provider polling + order expiry)');
}

export function stopWorkers(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
}
