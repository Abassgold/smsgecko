import { decryptJson, encryptJson } from './secretbox.js';
import { ENV_CREDENTIAL_FIELDS } from './providerEnv.js';
import { logger } from './logger.js';
import { CatalogOffer } from '../models/CatalogOffer.js';
import { ProviderConfig, type ProviderAdapterKey } from '../models/ProviderConfig.js';

/**
 * One placeholder row per built-in reseller adapter, so the admin Providers
 * page always lists every adapter the code ships — Tiger SMS, Hero SMS and SMS
 * Bower, the only three we sell through — not just the ones someone happened to
 * add by hand. Rows start disabled and hold no credentials — those
 * come from env (see providerEnv.ts); the admin only flips them on.
 */
const BUILT_IN_PROVIDERS: Array<{ key: ProviderAdapterKey; label: string }> = [
  { key: 'hero_sms', label: 'hero-sms' },
  { key: 'sms_bower', label: 'smsbower' },
  { key: 'tiger_sms', label: 'tiger-sms' },
];

/**
 * Providers that used to be supported and no longer are. Their rows and catalog offers are removed at start-up so an
 * existing database does not keep selling numbers that nothing can supply. Orders already placed through them keep their
 * history (they name the provider by label; the registry treats a missing row as "no adapter" and lets the number go).
 */
const RETIRED_PROVIDER_KEYS = ['custom_http', 'sms_code', 'sms_pool'];

/** Remove the rows and offers of retired providers. Safe to run on every start-up: it does nothing once they are gone. */
export async function retireProviders(): Promise<void> {
  // Raw collection: these keys are no longer in the model's enum, so the model would refuse to read them back.
  const rows = await ProviderConfig.collection.find({ key: { $in: RETIRED_PROVIDER_KEYS } }, { projection: { _id: 1, key: 1 } }).toArray();
  if (rows.length === 0) return;
  const ids = rows.map((r) => r._id);
  const offers = await CatalogOffer.deleteMany({ providerConfigId: { $in: ids } });
  await ProviderConfig.collection.deleteMany({ _id: { $in: ids } });
  logger.info({ providers: rows.map((r) => r.key), offersRemoved: offers.deletedCount }, '[providers] removed retired providers');
}

/**
 * Create the missing placeholder rows. Keyed by adapter, so an existing row
 * (however it has since been relabelled or configured) is never touched.
 */
export async function ensureProviders(): Promise<void> {
  await retireProviders();
  for (const p of BUILT_IN_PROVIDERS) {
    if (await ProviderConfig.exists({ key: p.key })) continue;
    if (await ProviderConfig.exists({ label: p.label })) continue; // label is unique
    await ProviderConfig.create({
      key: p.key,
      label: p.label,
      enabled: false,
      priority: 100,
      configEnc: encryptJson({}),
    });
    logger.info({ key: p.key }, '[providers] created placeholder provider');
  }

  // Credentials used to be stored on the row; they now come from env only.
  // Strip any left behind so no key sits in the database.
  const keys = BUILT_IN_PROVIDERS.map((p) => p.key);
  for (const cfg of await ProviderConfig.find({ key: { $in: keys } })) {
    const stored = decryptJson<Record<string, unknown>>(cfg.configEnc);
    if (!ENV_CREDENTIAL_FIELDS.some((f) => f in stored)) continue;
    for (const f of ENV_CREDENTIAL_FIELDS) delete stored[f];
    cfg.configEnc = encryptJson(stored);
    await cfg.save();
    logger.info({ key: cfg.key }, '[providers] removed stored credentials (env-only now)');
  }
}
