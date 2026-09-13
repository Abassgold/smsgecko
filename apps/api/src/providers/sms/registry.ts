import { conflict, providerError } from '../../lib/errors.js';
import { bustCatalogCache } from '../../lib/catalog.js';
import { decryptJson } from '../../lib/secretbox.js';
import { ProviderConfig, type ProviderConfigDoc } from '../../models/ProviderConfig.js';
import type { OrderDoc } from '../../models/Order.js';
import { CustomHttpProvider, type CustomHttpConfig } from './adapters/customHttp.js';
import { HeroSmsProvider, type HeroSmsConfig } from './adapters/heroSms.js';
import { DaisySmsProvider, type DaisySmsConfig } from './adapters/daisySms.js';
import { SmsBowerProvider, type SmsBowerConfig } from './adapters/smsBower.js';
import { SmsCodeProvider, type SmsCodeConfig } from './adapters/smsCode.js';
import { SmsPoolProvider, type SmsPoolConfig } from './adapters/smsPool.js';
import {
  NoStockError,
  ProviderConfigError,
  type HealthResult,
  type RentInput,
  type RentResult,
  type SmsProvider,
} from './types.js';

export type AdapterFactory = (
  cfg: ProviderConfigDoc,
  decrypted: Record<string, unknown>,
) => SmsProvider;

const ADAPTERS: Record<string, AdapterFactory> = {
  custom_http: (cfg, decrypted) => new CustomHttpProvider(decrypted as CustomHttpConfig, cfg.label),
  hero_sms: (cfg, decrypted) => new HeroSmsProvider(decrypted as HeroSmsConfig, cfg.label),
  daisy_sms: (cfg, decrypted) => new DaisySmsProvider(decrypted as DaisySmsConfig, cfg.label),
  sms_bower: (cfg, decrypted) => new SmsBowerProvider(decrypted as SmsBowerConfig, cfg.label),
  sms_code: (cfg, decrypted) => new SmsCodeProvider(decrypted as SmsCodeConfig, cfg.label),
  sms_pool: (cfg, decrypted) => new SmsPoolProvider(decrypted as SmsPoolConfig, cfg.label),
};

/**
 * Register an adapter at runtime. Only used by the test harness to wire the
 * `mock` fixture (`test/fake-sms-provider.ts`); the server ships no mock.
 */
export function registerAdapter(key: string, factory: AdapterFactory): void {
  ADAPTERS[key] = factory;
}

/** Stand-in for an order whose adapter key is unknown / no longer registered. */
const NULL_PROVIDER: SmsProvider = {
  key: 'none',
  label: 'No provider',
  async rent() {
    throw new ProviderConfigError('No adapter registered for this provider');
  },
  async poll() {
    return { status: 'waiting' };
  },
  async release() {
    /* nothing to release */
  },
  async finish() {
    /* nothing to finish */
  },
  async resend() {
    /* nothing to resend */
  },
  async healthCheck() {
    return { ok: false, detail: 'no adapter registered' };
  },
  async listServices() {
    return [];
  },
  async listCountries() {
    return [];
  },
  async listPrices() {
    return [];
  },
};

/** Cache instantiated adapters, keyed by config id + updatedAt. */
const cache = new Map<string, { provider: SmsProvider; sig: string; at: number }>();
const CACHE_TTL_MS = 15_000;

export function bustProviderCache(): void {
  cache.clear();
  bustCatalogCache();
}

function instantiate(cfg: ProviderConfigDoc): SmsProvider {
  const id = String(cfg._id);
  const sig = String((cfg.get('updatedAt') as Date | undefined)?.getTime() ?? 0);
  const hit = cache.get(id);
  if (hit && hit.sig === sig && Date.now() - hit.at < CACHE_TTL_MS) return hit.provider;
  const factory = ADAPTERS[cfg.key];
  const provider = factory ? factory(cfg, decryptJson(cfg.configEnc)) : NULL_PROVIDER;
  cache.set(id, { provider, sig, at: Date.now() });
  return provider;
}

/** Enabled providers, ordered by ascending priority (the fallback chain). */
export async function resolveChain(): Promise<{ cfg: ProviderConfigDoc; provider: SmsProvider }[]> {
  const configs = await ProviderConfig.find({ enabled: true }).sort({ priority: 1, createdAt: 1 });
  return configs.map((cfg) => ({ cfg, provider: instantiate(cfg) }));
}

/**
 * The single provider that drives the storefront catalog: the highest-priority
 * enabled one (lowest `priority`). Renting still walks the whole chain, but the
 * services / countries / prices users browse come from just this one.
 */
export async function getCatalogProvider(): Promise<{
  cfg: ProviderConfigDoc;
  provider: SmsProvider;
} | null> {
  const cfg = await ProviderConfig.findOne({ enabled: true }).sort({ priority: 1, createdAt: 1 });
  if (!cfg) return null;
  return { cfg, provider: instantiate(cfg) };
}

/** The provider that fulfilled a given order (for poll / release). */
export async function getProviderForOrder(order: OrderDoc): Promise<SmsProvider> {
  if (order.providerConfigId) {
    const cfg = await ProviderConfig.findById(order.providerConfigId);
    if (cfg) return instantiate(cfg);
  }
  return NULL_PROVIDER;
}

/** Best-effort release of a rented number by its provider config id. */
export async function releaseNumber(
  providerConfigId: string | null | undefined,
  providerRef: string,
): Promise<void> {
  if (!providerConfigId) return;
  try {
    const cfg = await ProviderConfig.findById(providerConfigId);
    if (cfg) await instantiate(cfg).release(providerRef);
  } catch {
    /* best-effort */
  }
}

export async function runHealthCheck(cfg: ProviderConfigDoc): Promise<HealthResult> {
  try {
    const result = await instantiate(cfg).healthCheck();
    cfg.set({
      healthOk: result.ok,
      healthDetail: result.detail ?? null,
      healthCheckedAt: new Date(),
    });
    await cfg.save();
    return result;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'health check failed';
    cfg.set({ healthOk: false, healthDetail: detail, healthCheckedAt: new Date() });
    await cfg.save();
    return { ok: false, detail };
  }
}

async function bumpStat(
  id: unknown,
  patch: Record<string, number | Date | string>,
): Promise<void> {
  const inc: Record<string, number> = {};
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number') inc[`stats.${k}`] = v;
    else set[`stats.${k}`] = v;
  }
  const update: Record<string, unknown> = {};
  if (Object.keys(inc).length) update.$inc = inc;
  if (Object.keys(set).length) update.$set = set;
  await ProviderConfig.updateOne({ _id: id }, update);
}

export interface RentWithFallbackResult {
  providerConfigId: string;
  providerKey: string;
  providerLabel: string;
  result: RentResult;
}

/** Walk the enabled chain; rent from the first provider that has stock. */
export async function rentWithFallback(input: RentInput): Promise<RentWithFallbackResult> {
  const chain = await resolveChain();
  if (chain.length === 0) throw conflict('No SMS provider is enabled');

  const errors: string[] = [];
  // Per-provider outcome for the caller — only the two failure modes our
  // adapters actually distinguish today (no stock vs. misconfigured/unreachable);
  // anything else falls into the generic 'provider_error' bucket rather than
  // guessing at a finer-grained cause we can't actually tell apart.
  const attempts: Array<{ provider: string; outcome: string }> = [];
  for (const { cfg, provider } of chain) {
    await bumpStat(cfg._id, { rentAttempts: 1 });
    try {
      const result = await provider.rent(input);
      await bumpStat(cfg._id, { rentSuccess: 1, lastUsedAt: new Date() });
      return {
        providerConfigId: String(cfg._id),
        providerKey: cfg.key,
        providerLabel: cfg.label,
        result,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const outcome =
        err instanceof NoStockError
          ? 'no_numbers'
          : err instanceof ProviderConfigError
            ? 'provider_unavailable'
            : 'provider_error';
      await bumpStat(cfg._id, {
        [err instanceof NoStockError ? 'rentNoStock' : 'rentError']: 1,
        lastError: msg,
        lastErrorAt: new Date(),
      });
      attempts.push({ provider: cfg.label, outcome });
      errors.push(`${cfg.label}: ${msg}`);
    }
  }
  throw providerError(`No provider could supply a number — ${errors.join('; ')}`, { attempts });
}

export async function recordOtpReceived(order: OrderDoc): Promise<void> {
  if (order.providerConfigId) await bumpStat(order.providerConfigId, { otpReceived: 1 });
}

export { NoStockError, ProviderConfigError };
export type { SmsProvider, RentInput, RentResult, HealthResult };
