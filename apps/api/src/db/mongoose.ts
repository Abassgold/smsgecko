import mongoose from 'mongoose';
import { env } from '../config/env.js';

mongoose.set('strictQuery', true);

let connecting: Promise<typeof mongoose> | null = null;

export async function connectMongo(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
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
