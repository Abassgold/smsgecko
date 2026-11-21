import { CatalogOffer } from '../../models/CatalogOffer.js';
import { getCatalogProvider } from '../../providers/sms/registry.js';
import { bustCatalogCache } from '../../lib/catalog.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { logAdminAction } from '../../lib/adminLog.js';
import { getSyncStatus, resetStoredCatalogMemo, startSyncInBackground } from '../catalogSync.js';

export const getCatalogStatus = getSyncStatus;

/**
 * "Sync now": a full sync takes a minute or more, longer than a browser or proxy will wait for one request, so this
 * starts it and answers at once; the admin page polls the status (`syncing`, `syncError`, `lastSync`).
 */
export async function syncNow(adminId: string) {
  const cat = await getCatalogProvider();
  if (!cat) throw badRequest('No SMS provider is enabled');
  if (!cat.provider.listCountryPrices) throw badRequest('This provider has no price catalog to sync: it is read live');
  const { started } = startSyncInBackground();
  if (!started) throw conflict('A sync is already running');
  void logAdminAction(adminId, 'catalog_sync', { type: 'provider', id: String(cat.cfg._id) }, 'started');
  return getSyncStatus();
}

/** Switch one service × country off (or back on). A sync keeps its prices fresh but never turns it back on. */
export async function setOfferDisabled(
  adminId: string,
  input: { serviceCode: string; countryCode: string; disabled: boolean },
) {
  const cat = await getCatalogProvider();
  if (!cat) throw badRequest('No SMS provider is enabled');
  const { serviceCode, countryCode, disabled } = input;
  await CatalogOffer.updateOne(
    { providerConfigId: cat.cfg._id, serviceCode, countryCode },
    { $set: { adminDisabled: disabled }, $setOnInsert: { tiers: [], syncedAt: null } },
    { upsert: true },
  );
  bustCatalogCache();
  resetStoredCatalogMemo();
  void logAdminAction(
    adminId,
    disabled ? 'offer_disable' : 'offer_enable',
    { type: 'offer', id: `${serviceCode}:${countryCode}` },
    `${serviceCode} · ${countryCode}`,
  );
  return { serviceCode, countryCode, disabled };
}

/** The offers an admin switched off (for the admin page). */
export async function listDisabledOffers() {
  const cat = await getCatalogProvider();
  if (!cat) return [];
  const rows = await CatalogOffer.find({ providerConfigId: cat.cfg._id, adminDisabled: true })
    .select('serviceCode countryCode')
    .sort({ serviceCode: 1, countryCode: 1 })
    .lean();
  return rows.map((r) => ({ serviceCode: r.serviceCode, countryCode: r.countryCode }));
}
