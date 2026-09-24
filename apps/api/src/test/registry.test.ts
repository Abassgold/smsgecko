import { describe, expect, it } from 'vitest';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { rentWithFallback } from '../providers/sms/registry.js';

describe('rentWithFallback: a successful rent clears a stale lastError', () => {
  it('unsets stats.lastError/lastErrorAt once a provider that previously failed succeeds again', async () => {
    // beforeEach (test/setup.ts) already seeded one enabled 'mock' provider.
    const cfg = await ProviderConfig.findOne({ key: 'mock' });
    if (!cfg) throw new Error('expected the default mock ProviderConfig from test/setup.ts');

    // Simulate a stale error left over from an earlier failed rent attempt —
    // e.g. a transient "no numbers available" a while ago — that nothing
    // since has cleared, even though the provider is healthy again.
    await ProviderConfig.updateOne(
      { _id: cfg._id },
      { $set: { 'stats.lastError': 'mock: no numbers available', 'stats.lastErrorAt': new Date() } },
    );

    const before = await ProviderConfig.findById(cfg._id).lean();
    expect(before?.stats?.lastError).toBe('mock: no numbers available');

    // The default mock fixture (no `failRent`) succeeds.
    await rentWithFallback({ serviceSlug: 'whatsapp', countryCode: 'us', dialCode: '1' });

    const after = await ProviderConfig.findById(cfg._id).lean();
    expect(after?.stats?.lastError).toBeNull();
    expect(after?.stats?.lastErrorAt).toBeNull();
    // The success counters still moved, so this isn't just a blanket stats wipe.
    expect(after?.stats?.rentSuccess).toBe(1);
  });
});
