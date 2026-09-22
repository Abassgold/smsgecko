import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { registerAdapter, bustProviderCache } from '../providers/sms/registry.js';
import { MockSmsProvider, type MockConfig } from './fake-sms-provider.js';
import type {
  CatalogCountry,
  CatalogPrice,
  CatalogQuery,
  CatalogService,
  HealthResult,
  PollContext,
  PollResult,
  RentInput,
  RentResult,
  SmsProvider,
} from '../providers/sms/types.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(async () => {
  // Restore the real `mock` fixture (test/setup.ts registers it once, at
  // module load, for every other test file) — this suite's `FlakyProvider`
  // borrows the same adapter key, since ProviderConfig.key is a closed enum
  // and 'flaky' isn't a member of it.
  registerAdapter('mock', (cfg, decrypted) => new MockSmsProvider(decrypted as MockConfig, cfg.label));
});

/** A provider whose listServices()/listCountries() throw exactly `failCount`
 *  times before succeeding — simulates one transient upstream hiccup. */
class FlakyProvider implements SmsProvider {
  readonly key = 'mock';
  readonly label = 'flaky';
  private calls = 0;
  constructor(private readonly failCount: number) {}

  private maybeFail(): void {
    this.calls += 1;
    if (this.calls <= this.failCount) throw new Error('transient upstream failure');
  }

  async rent(): Promise<RentResult> {
    throw new Error('not used in this test');
  }
  async poll(_ctx: PollContext): Promise<PollResult> {
    return { status: 'waiting' };
  }
  async release(): Promise<void> {}
  async healthCheck(): Promise<HealthResult> {
    return { ok: true };
  }
  async listServices(): Promise<CatalogService[]> {
    this.maybeFail();
    return [{ code: 'whatsapp', name: 'WhatsApp' }];
  }
  async listCountries(): Promise<CatalogCountry[]> {
    this.maybeFail();
    return [{ code: 'us', name: 'United States', iso2: 'us' }];
  }
  async listPrices(_q: CatalogQuery): Promise<CatalogPrice[]> {
    return [];
  }
}

describe('catalog: a one-off provider failure does not poison the cache', () => {
  it('recovers on the very next request instead of staying empty for the cache TTL', async () => {
    // One failure, then healthy from the second call on — exactly the real
    // scenario: a transient hiccup right after a provider is switched on.
    registerAdapter('mock', () => new FlakyProvider(1));
    await ProviderConfig.create({ key: 'mock', label: 'Flaky test provider', enabled: true, priority: 1 });
    bustProviderCache();

    const first = await inject({ method: 'GET', url: '/api/v1/catalog/services' });
    expect(first.statusCode).toBe(200);
    // The provider's own listServices() threw; the route degrades to an
    // empty list rather than a 500 — this is the pre-existing, correct
    // failure behavior. What matters is what happens next.
    expect(first.json()).toEqual([]);

    // Immediately after — well within the 5-minute cache TTL. Before the fix,
    // catalogCached() would have memoized that first empty result and this
    // would still be `[]`.
    const second = await inject({ method: 'GET', url: '/api/v1/catalog/services' });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual([{ id: 'whatsapp', slug: 'whatsapp', name: 'WhatsApp', iconKey: '', popular: false }]);

    // A genuine success is still cached, though: a third call — where the
    // fixture would now throw again if actually invoked (failCount is 1) —
    // still returns the cached result rather than erroring.
    const third = await inject({ method: 'GET', url: '/api/v1/catalog/services' });
    expect(third.statusCode).toBe(200);
    expect(third.json()).toEqual(second.json());
  });
});
