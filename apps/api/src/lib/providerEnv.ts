/**
 * Reseller credentials live in the process environment (Render → Environment),
 * never in the database — the admin panel only toggles providers on/off. The
 * ProviderConfig row keeps enabled / priority / stats plus optional non-secret
 * extras (serviceMap / countryMap); these values are overlaid on top of it.
 *
 * Read from `process.env` at call time (not the parsed `env` singleton) so a
 * restart picks up a changed key and tests can set them per case.
 */

interface ResellerEnvSpec {
  defaultBaseUrl: string;
  /** Config field -> env var. `required` ones must be set to enable the provider. */
  vars: Array<{ field: 'apiKey' | 'userId' | 'baseUrl'; name: string; required: boolean }>;
}

export const RESELLER_ENV: Record<string, ResellerEnvSpec> = {
  hero_sms: {
    defaultBaseUrl: 'https://hero-sms.com/stubs/handler_api.php',
    vars: [
      { field: 'apiKey', name: 'HERO_SMS_API_KEY', required: true },
      { field: 'baseUrl', name: 'HERO_SMS_BASE_URL', required: false },
    ],
  },
  sms_bower: {
    defaultBaseUrl: 'https://smsbower.page/stubs/handler_api.php',
    vars: [
      { field: 'apiKey', name: 'SMSBOWER_API_KEY', required: true },
      { field: 'userId', name: 'SMSBOWER_USER_ID', required: true },
      { field: 'baseUrl', name: 'SMSBOWER_BASE_URL', required: false },
    ],
  },
  sms_code: {
    defaultBaseUrl: 'https://api.smscode.gg/v2',
    vars: [
      { field: 'apiKey', name: 'SMSCODE_API_KEY', required: true },
      { field: 'baseUrl', name: 'SMSCODE_BASE_URL', required: false },
    ],
  },
  sms_pool: {
    defaultBaseUrl: 'https://api.smspool.net',
    vars: [
      { field: 'apiKey', name: 'SMSPOOL_API_KEY', required: true },
      { field: 'baseUrl', name: 'SMSPOOL_BASE_URL', required: false },
    ],
  },
};

/** Credential fields that come from env and must never be stored in the DB. */
export const ENV_CREDENTIAL_FIELDS = ['apiKey', 'userId', 'baseUrl'] as const;

export function isEnvProvider(key: string): boolean {
  return key in RESELLER_ENV;
}

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** `{ baseUrl, apiKey, userId? }` for a reseller, from env (baseUrl defaulted). */
export function envCredentials(key: string): Record<string, string> {
  const spec = RESELLER_ENV[key];
  if (!spec) return {};
  const out: Record<string, string> = { baseUrl: spec.defaultBaseUrl };
  for (const v of spec.vars) {
    const value = read(v.name);
    if (value || v.field !== 'baseUrl') out[v.field] = value;
  }
  return out;
}

/** Names of required env vars that are unset for this reseller ([] = ready). */
export function missingEnvVars(key: string): string[] {
  const spec = RESELLER_ENV[key];
  if (!spec) return [];
  return spec.vars.filter((v) => v.required && !read(v.name)).map((v) => v.name);
}

/** Every env var a reseller reads, for display. */
export function envVarNames(key: string): string[] {
  return RESELLER_ENV[key]?.vars.filter((v) => v.required).map((v) => v.name) ?? [];
}
