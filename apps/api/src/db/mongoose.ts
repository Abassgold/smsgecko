import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

mongoose.set('strictQuery', true);

let connecting: Promise<typeof mongoose> | null = null;
let listenersAttached = false;

/**
 * Attach connection listeners once. Without an `'error'` listener, a driver
 * monitor error (e.g. a transient Atlas timeout) is emitted on an EventEmitter
 * with no handler, which Node turns into an uncaught exception that kills the
 * process. The mongo driver reconnects on its own — these just log so a blip
 * stays a blip instead of a crash. On reconnect we drop the cached connect
 * promise so a later `connectMongo()` can re-establish if it ever fully closes.
 */
function attachConnectionListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  const conn = mongoose.connection;
  conn.on('error', (err) => logger.error({ err }, '[mongo] connection error — driver will retry'));
  conn.on('disconnected', () => logger.warn('[mongo] disconnected — driver will reconnect'));
  conn.on('reconnected', () => logger.info('[mongo] reconnected'));
  conn.on('connected', () => logger.info('[mongo] connected'));
  conn.on('close', () => {
    connecting = null;
  });
}

export async function connectMongo(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  attachConnectionListeners();
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!connecting) {
    connecting = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      autoIndex: env.NODE_ENV !== 'production',
    });
  }
  await connecting;
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  connecting = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function supportsTransactions(): boolean {
  // @ts-expect-error - topology is not in the public types
  const topology = mongoose.connection.client?.topology;
  const desc = topology?.description;
  if (!desc) return false;
  return desc.type === 'ReplicaSetWithPrimary' || desc.type === 'Sharded';
}

export { mongoose };
