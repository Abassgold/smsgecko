import { existsSync } from 'node:fs';
import { z } from 'zod';

// Load a local .env (api package root) when present. Node >=20.12 ships
// process.loadEnvFile(); this is a no-op on deploy targets that inject env vars.
try {
  if (typeof process.loadEnvFile === 'function' && existsSync('.env')) {
    process.loadEnvFile();
  }
} catch {
  // ignore — fall back to real process.env
}

const bool = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .pipe(z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  MONGODB_URI: z
    .string()
    .default('mongodb://localhost:27017/smsgecko?replicaSet=rs0&directConnection=true'),

  JWT_ACCESS_SECRET: z.string().min(8).default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(8).default('dev-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  COOKIE_SECURE: bool.default(false),

  /** AES-256-GCM key (base64) for encrypting provider credentials at rest. */
  SETTINGS_ENC_KEY: z.string().min(8).default('dev-settings-enc-key-change-me'),

  PAYMENTS_MOCK: bool.default(true),
  ORDER_TTL_SECONDS: z.coerce.number().int().positive().default(1200),
  MOCK_SMS_SUCCESS_RATE: z.coerce.number().min(0).max(1).default(0.8),
  MOCK_SMS_MIN_DELAY_MS: z.coerce.number().int().nonnegative().default(5000),
  MOCK_SMS_MAX_DELAY_MS: z.coerce.number().int().nonnegative().default(45000),

  WORKERS_ENABLED: bool.default(true),

  /** Resend API key for transactional email. When unset, emails are logged to the console instead of sent. */
  RESEND_API_KEY: z.string().optional(),
  /** From address for transactional email. Must be a verified Resend sender/domain in production. */
  EMAIL_FROM: z.string().default('SMSGecko <onboarding@resend.dev>'),
  /** Public base URL of the web app, used to build links in emails. */
  APP_URL: z.string().default('http://localhost:3000'),
  /** Hours a verification link stays valid. */
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(overrides: Record<string, string | undefined> = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(overrides);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  if (
    cached.NODE_ENV === 'production' &&
    (cached.JWT_ACCESS_SECRET.startsWith('dev-') ||
      cached.JWT_REFRESH_SECRET.startsWith('dev-') ||
      cached.SETTINGS_ENC_KEY.startsWith('dev-'))
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] running in production with a default secret — set JWT_*_SECRET and SETTINGS_ENC_KEY',
    );
  }
  return cached;
}

/** For tests: force re-read of env on next loadEnv(). */
export function resetEnvCache(): void {
  cached = null;
}

export const env = loadEnv();
