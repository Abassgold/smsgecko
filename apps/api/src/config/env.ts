import { existsSync } from 'node:fs';
import { z } from 'zod';

// Load a local .env (api package root) when present. Node >=20.12 ships
// process.loadEnvFile(); this is a no-op on deploy targets that inject env vars.
//
// Test runs load `.env.test` instead of `.env` when present — never the
// real one. Provider singletons (Stripe/Bachs/NowPayments/Cryptomus) are
// built once at module load from these values, so a real key sitting in
// `.env` would otherwise make `npm test` place actual API calls against a
// live payment account on every run.
const envFile = process.env.NODE_ENV === 'test' && existsSync('.env.test') ? '.env.test' : '.env';
try {
  if (typeof process.loadEnvFile === 'function' && existsSync(envFile)) {
    process.loadEnvFile(envFile);
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

  ORDER_TTL_SECONDS: z.coerce.number().int().positive().default(1200),

  /** Stripe secret key (test or live). When unset, card deposits are unavailable. */
  STRIPE_SECRET_KEY: z.string().optional(),
  /** Signing secret for the Stripe webhook endpoint (`whsec_...`), from the Stripe dashboard/CLI. */
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** NowPayments API key. When unset, USDT deposits are unavailable. */
  NOWPAYMENTS_API_KEY: z.string().optional(),
  /** Secret used to verify the `x-nowpayments-sig` header on IPN callbacks. */
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),
  /** Use NowPayments' sandbox API host instead of the production one. */
  NOWPAYMENTS_SANDBOX: bool.default(true),
  /** Bachs API key (sk_sandbox_... or sk_live_...). When unset, bachs deposits are unavailable. */
  BACHS_API_KEY: z.string().optional(),
  /** Signing secret for the Bachs webhook endpoint, from the Bachs developer portal. */
  BACHS_WEBHOOK_SECRET: z.string().optional(),
  /** Use Bachs' sandbox API host instead of the production one. */
  BACHS_SANDBOX: bool.default(true),
  /** Cryptomus merchant UUID. When unset (or the API key below is), cryptomus deposits are unavailable. */
  CRYPTOMUS_MERCHANT_ID: z.string().optional(),
  /** Cryptomus payment API key — signs outgoing requests and verifies inbound webhooks. */
  CRYPTOMUS_API_KEY: z.string().optional(),

  WORKERS_ENABLED: bool.default(true),

  /** Amazon SES SMTP endpoint for transactional email, e.g. email-smtp.eu-north-1.amazonaws.com.
   *  When unset, emails are logged to the console instead of sent. */
  SES_SMTP_HOST: z.string().optional(),
  SES_SMTP_PORT: z.coerce.number().int().positive().default(587),
  /** IAM SMTP credentials scoped to ses:SendRawEmail only — see SMTP settings > Create SMTP credentials in the SES console. */
  SES_SMTP_USER: z.string().optional(),
  SES_SMTP_PASS: z.string().optional(),
  /** From address for transactional email. Must be a verified SES identity/domain in production. */
  EMAIL_FROM: z.string().default('SMSGecko <onboarding@resend.dev>'),
  /** Public base URL of the web app, used to build links in emails. */
  APP_URL: z.string().default('http://localhost:3000'),
  /** Public base URL of this API itself, used to build the NowPayments IPN callback URL. */
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  /** Minutes a verification link stays valid. */
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().positive().default(5),
  /** Minutes a password reset link stays valid. */
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
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
