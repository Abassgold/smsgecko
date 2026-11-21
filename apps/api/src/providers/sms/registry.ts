import { AppError, conflict, providerError } from '../../lib/errors.js';
import { bustCatalogCache } from '../../lib/catalog.js';
import { decryptJson } from '../../lib/secretbox.js';
import { envCredentials, isEnvProvider } from '../../lib/providerEnv.js';
import { logger } from '../../lib/logger.js';
import { ProviderConfig, type ProviderConfigDoc } from '../../models/ProviderConfig.js';
import type { OrderDoc } from '../../models/Order.js';
import { HeroSmsProvider, type HeroSmsConfig } from './adapters/heroSms.js';
import { SmsBowerProvider, type SmsBowerConfig } from './adapters/smsBower.js';
import { TigerSmsProvider, type TigerSmsConfig } from './adapters/tigerSms.js';
import {
  NoStockError,
  ProviderConfigError,
  ProviderUnavailableError,
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
  hero_sms: (cfg, decrypted) => new HeroSmsProvider(decrypted as HeroSmsConfig, cfg.label),
  sms_bower: (cfg, decrypted) => new SmsBowerProvider(decrypted as SmsBowerConfig, cfg.label),
  tiger_sms: (cfg, decrypted) => new TigerSmsProvider(decrypted as TigerSmsConfig, cfg.label),
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
    // No adapter to ask (config deleted / legacy row): nothing can be confirmed, so the number is simply let go.
    return { status: 'canceled' as const };
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
  // Resellers take their credentials from env; the stored blob only carries
  // non-secret extras (serviceMap / countryMap). Env always wins.
  const stored = decryptJson<Record<string, unknown>>(cfg.configEnc);
  const config = isEnvProvider(cfg.key) ? { ...stored, ...envCredentials(cfg.key) } : stored;
  const provider = factory ? factory(cfg, config) : NULL_PROVIDER;
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

/**
 * Hand back a number we rented but cannot keep (the order could not be saved). Nothing else can undo it, so a
 * failure is logged loudly instead of swallowed: it means a number we paid for is still active upstream.
 */
export async function releaseNumber(
  providerConfigId: string | null | undefined,
  providerRef: string,
): Promise<void> {
  if (!providerConfigId) return;
  try {
    const cfg = await ProviderConfig.findById(providerConfigId);
    if (!cfg) return;
    const res = await instantiate(cfg).release(providerRef);
    if (res.status !== 'canceled') {
      logger.error({ providerRef, providerConfigId, result: res.status }, '[registry] rented number could not be released: still billed upstream');
    }
  } catch (err) {
    logger.error({ err, providerRef, providerConfigId }, '[registry] rented number could not be released: still billed upstream');
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
  patch: Record<string, number | Date | string | null>,
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
  const attempts: Array<{ outcome: string }> = [];
  for (const { cfg, provider } of chain) {
    await bumpStat(cfg._id, { rentAttempts: 1 });
    try {
      const result = await provider.rent(input);
      // A success clears any stale lastError left over from an earlier failed
      // attempt — otherwise the admin page keeps showing a red error banner
      // indefinitely once a provider has recovered, since nothing else ever
      // unsets it.
      await bumpStat(cfg._id, {
        rentSuccess: 1,
        lastUsedAt: new Date(),
        lastError: null,
        lastErrorAt: null,
      });
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
          : err instanceof ProviderConfigError || err instanceof ProviderUnavailableError
            ? 'provider_unavailable'
            : 'provider_error';
      await bumpStat(cfg._id, {
        [err instanceof NoStockError ? 'rentNoStock' : 'rentError']: 1,
        lastError: msg,
        lastErrorAt: new Date(),
      });
      attempts.push({ outcome });
      errors.push(`${cfg.label}: ${msg}`);
    }
  }
  // The full per-provider detail (`errors`) is a reseller's own raw error
  // text — pool names, internal price thresholds, HTML markup, whatever
  // that upstream API felt like returning. Useful for us, meaningless (or
  // actively confusing) to a customer, so it's logged for debugging but
  // never put in the response body. The customer just gets a clean,
  // generic message; `details.attempts` (one outcome per provider tried — no
  // names: which reseller we use is never exposed)
  // is the most a client ever sees of what went wrong.
  logger.warn({ errors }, 'no provider could supply a number');
  // Only a stock answer from every provider means "no numbers". If any was unreachable / out of balance / unrecognised
  // we cannot say that: report the outage, never "no numbers" (manesms: NoNumbersError 422 vs ProviderUnavailableError 503).
  if (attempts.some((a) => a.outcome !== 'no_numbers')) {
    throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Numbers are temporarily unavailable. Please try again shortly.', { attempts });
  }
  throw providerError('No numbers are available for this service right now — please try again shortly.', {
    attempts,
  });
}

export async function recordOtpReceived(order: OrderDoc): Promise<void> {
  if (order.providerConfigId) await bumpStat(order.providerConfigId, { otpReceived: 1 });
}

export { NoStockError, ProviderConfigError, ProviderUnavailableError };
export type { SmsProvider, RentInput, RentResult, HealthResult };
