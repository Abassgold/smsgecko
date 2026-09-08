import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectMongo, disconnectMongo, mongoose } from '../db/mongoose.js';
import { ensureSettings, bustSettingsCache } from '../lib/settings.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { bustProviderCache } from '../providers/sms/registry.js';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectMongo(replSet.getUri('smsgecko_test'));
}, 120_000);

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  bustProviderCache();
  bustSettingsCache();
});

// Every test starts with the global settings doc + one enabled mock provider.
beforeEach(async () => {
  await ensureSettings();
  await ProviderConfig.create({
    key: 'mock',
    label: 'Mock SIM bank',
    enabled: true,
    priority: 0,
  });
  bustProviderCache();
});

afterAll(async () => {
  await disconnectMongo();
  await replSet?.stop();
});
