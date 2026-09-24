import { encryptJson } from './secretbox.js';
import { logger } from './logger.js';
import { ProviderConfig, type ProviderAdapterKey } from '../models/ProviderConfig.js';

/**
 * One placeholder row per built-in reseller adapter, so the admin Providers
 * page always lists every adapter the code ships — not just the ones someone
 * happened to add by hand. Rows start disabled with the reseller's base URL
 * pre-filled and an empty `apiKey`; the admin only pastes the key and flips it on.
 */
const BUILT_IN_PROVIDERS: Array<{ key: ProviderAdapterKey; label: string; baseUrl: string }> = [
  { key: 'hero_sms', label: 'hero-sms', baseUrl: 'https://hero-sms.com/stubs/handler_api.php' },
  { key: 'sms_bower', label: 'smsbower', baseUrl: 'https://smsbower.page/stubs/handler_api.php' },
  { key: 'sms_code', label: 'smscode', baseUrl: 'https://api.smscode.gg/v2' },
  { key: 'sms_pool', label: 'smspool', baseUrl: 'https://api.smspool.net' },
];

/**
 * Create the missing placeholder rows. Keyed by adapter, so an existing row
 * (however it has since been relabelled or configured) is never touched.
 */
export async function ensureProviders(): Promise<void> {
  for (const p of BUILT_IN_PROVIDERS) {
    if (await ProviderConfig.exists({ key: p.key })) continue;
    if (await ProviderConfig.exists({ label: p.label })) continue; // label is unique
    await ProviderConfig.create({
      key: p.key,
      label: p.label,
      enabled: false,
      priority: 100,
      configEnc: encryptJson({ baseUrl: p.baseUrl, apiKey: '' }),
    });
    logger.info({ key: p.key }, '[providers] created placeholder provider');
  }
}
