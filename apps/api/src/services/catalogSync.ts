import { CatalogOffer } from '../models/CatalogOffer.js';
import { Setting } from '../models/Setting.js';
import { ensureSettings } from '../lib/settings.js';
import { getCatalogProvider } from '../providers/sms/registry.js';
import { bustCatalogCache } from '../lib/catalog.js';
import { logger } from '../lib/logger.js';
import { badRequest } from '../lib/errors.js';
import type { CatalogPrice } from '../providers/sms/types.js';

/** Parallel country requests (manesms: 5 at a time). */
const CONCURRENCY = 5;
/** Older than this and the stored copy is not trusted: reads go back to the provider live. */
export const CATALOG_MAX_AGE_MS = 6 * 60 * 60_000;
/** How often the worker re-syncs (manesms: every 2 hours). */
export const CATALOG_SYNC_INTERVAL_MS = 2 * 60 * 60_000;

export interface CatalogSyncReport {
  offersUpdated: number;
  offersInStock: number;
  /** Countries whose price fetch failed (or came back empty); their stored offers were left untouched. */
  countriesSkipped: string[];
}

const freshCache = new Map<string, { ok: boolean; at: number }>();

/** Is the stored copy of this provider's catalog recent enough to browse from? (60s memo.) */
export async function storedFresh(providerConfigId: string): Promise<boolean> {
  const hit = freshCache.get(providerConfigId);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  const s = await Setting.findById('global').select('catalogSync').lean();
  const sync = s?.catalogSync;
  const ok =
    !!sync?.at &&
    sync.providerConfigId === providerConfigId &&
    Date.now() - sync.at.getTime() < CATALOG_MAX_AGE_MS;
  freshCache.set(providerConfigId, { ok, at: Date.now() });
  return ok;
}

export function resetStoredCatalogMemo(): void {
  freshCache.clear();
}

let running: Promise<CatalogSyncReport> | null = null;
let lastError: string | null = null;

/** Group a country's rows by service into cheapest-first tiers, dropping unsellable ones and duplicates. */
export function buildTiers(rows: CatalogPrice[]) {
  const byService = new Map<string, { priceMicro: number; stock: number | null; operator: string | null }[]>();
  for (const r of rows) {
    if (!(r.priceMicro > 0)) continue;
    if (r.stock != null && r.stock <= 0) continue; // nothing to sell at this price
    const list = byService.get(r.serviceCode) ?? [];
    list.push({ priceMicro: r.priceMicro, stock: r.stock ?? null, operator: r.operator ?? null });
    byService.set(r.serviceCode, list);
  }
  for (const [svc, list] of byService) {
    list.sort((a, b) => a.priceMicro - b.priceMicro);
    const seen = new Set<string>();
    byService.set(
      svc,
      list.filter((t) => {
        const k = `${t.priceMicro}:${t.operator ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
    );
  }
  return byService;
}

/**
 * Refresh the stored catalog of the catalog provider (the same sequence as manesms's `syncCatalog`): country by
 * country, 5 at a time. A country that fails keeps its old offers, an empty country list refuses to overwrite
 * anything, and an offer an admin disabled keeps its flag. Only one sync runs at a time.
 */
export function syncCatalog(): Promise<CatalogSyncReport> {
  if (running) return running;
  running = doSync()
    .then(async (report) => {
      lastError = null;
      return report;
    })
    .catch(async (err) => {
      lastError = err instanceof Error ? err.message : 'Sync failed';
      await Setting.updateOne({ _id: 'global' }, { $set: { 'catalogSync.error': lastError } }).catch(() => undefined);
      throw err;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

async function doSync(): Promise<CatalogSyncReport> {
  const cat = await getCatalogProvider();
  if (!cat) throw badRequest('No SMS provider is enabled');
  const { provider, cfg } = cat;
  if (!provider.listCountryPrices) throw badRequest('This provider has no price catalog to sync: it is read live');

  const countries = await provider.listCountries();
  if (!countries.length) {
    throw new Error('The provider returned no countries: refusing to overwrite the stored catalog');
  }

  const providerConfigId = cfg._id;
  const report: CatalogSyncReport = { offersUpdated: 0, offersInStock: 0, countriesSkipped: [] };
  const startedAt = new Date();

  const syncCountry = async (country: { code: string }) => {
    let rows: CatalogPrice[];
    try {
      rows = await provider.listCountryPrices!(country.code);
    } catch (err) {
      logger.warn({ err, country: country.code }, '[catalog] price fetch failed, keeping existing offers');
      report.countriesSkipped.push(country.code);
      return;
    }
    // An empty answer is treated like a failed one: keep what we have rather than zero a whole country on a blip.
    if (!rows.length) {
      report.countriesSkipped.push(country.code);
      return;
    }
    const byService = buildTiers(rows);
    const now = new Date();
    const ops = [...byService].map(([serviceCode, tiers]) => ({
      updateOne: {
        filter: { providerConfigId, serviceCode, countryCode: country.code },
        // adminDisabled is never touched here: a sync keeps the price fresh but can't switch an offer back on.
        update: { $set: { tiers, syncedAt: now } },
        upsert: true,
      },
    }));
    if (ops.length) await CatalogOffer.bulkWrite(ops as unknown as Parameters<typeof CatalogOffer.bulkWrite>[0], { ordered: false });
    // Services this country sold before but no longer lists: sold out.
    await CatalogOffer.updateMany(
      { providerConfigId, countryCode: country.code, serviceCode: { $nin: [...byService.keys()] } },
      { $set: { tiers: [], syncedAt: now } },
    );
    report.offersUpdated += ops.length;
    report.offersInStock += ops.filter((o) => o.updateOne.update.$set.tiers.length > 0).length;
  };

  const queue = [...countries];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) await syncCountry(c);
    }),
  );

  await ensureSettings();
  await Setting.updateOne(
    { _id: 'global' },
    {
      $set: {
        catalogSync: {
          at: startedAt,
          providerConfigId: String(providerConfigId),
          offersUpdated: report.offersUpdated,
          offersInStock: report.offersInStock,
          skippedCountries: report.countriesSkipped,
          error: null,
        },
      },
    },
  );
  bustCatalogCache();
  resetStoredCatalogMemo();
  logger.info({ offers: report.offersUpdated, inStock: report.offersInStock, skipped: report.countriesSkipped.length }, '[catalog] synced');
  return report;
}

/** Start a sync unless one is running; returns at once (a full sync takes a minute or more). */
export function startSyncInBackground(): { started: boolean } {
  if (running) return { started: false };
  void syncCatalog().catch((err) => logger.error({ err }, '[catalog] sync failed'));
  return { started: true };
}

export async function getSyncStatus() {
  const s = await Setting.findById('global').select('catalogSync').lean();
  const last = s?.catalogSync ?? null;
  return {
    syncing: running !== null,
    syncError: lastError ?? last?.error ?? null,
    lastSync: last?.at
      ? {
          at: last.at.toISOString(),
          offersUpdated: last.offersUpdated ?? 0,
          offersInStock: last.offersInStock ?? 0,
          skippedCountries: last.skippedCountries ?? [],
        }
      : null,
  };
}

/** Resolves when the running sync (if any) has ended. For tests. */
export const waitForSync = () => running?.catch(() => undefined) ?? Promise.resolve();
