import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectMongo, disconnectMongo, mongoose } from '../db/mongoose.js';
import { ensureSettings, bustSettingsCache } from '../lib/settings.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { bustProviderCache, registerAdapter } from '../providers/sms/registry.js';
import { MockSmsProvider, type MockConfig } from './fake-sms-provider.js';

let replSet: MongoMemoryReplSet;

// The server ships no mock adapter — the test suite wires the fixture in here.
registerAdapter('mock', (cfg, decrypted) => new MockSmsProvider(decrypted as MockConfig, cfg.label));

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
