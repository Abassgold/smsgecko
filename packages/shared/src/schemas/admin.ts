import { z } from 'zod';
import { ORDER_STATUSES, TRANSACTION_TYPES, DEPOSIT_STATUSES } from '../constants';
import { objectId, paginated } from './common';

/* ---------------- providers ---------------- */

export const PROVIDER_KEYS = [
  'mock',
  'custom_http',
  'hero_sms',
  'daisy_sms',
  'sms_bower',
  'sms_code',
  'sms_pool',
] as const;

export const providerStatsView = z.object({
  rentAttempts: z.number().int(),
  rentSuccess: z.number().int(),
  rentNoStock: z.number().int(),
  rentError: z.number().int(),
  otpReceived: z.number().int(),
  lastUsedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  lastErrorAt: z.string().nullable(),
});

export const providerConfigView = z.object({
  id: z.string(),
  key: z.enum(PROVIDER_KEYS),
  label: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  /** Adapter config with secret-looking values masked ("••••1234"). */
  config: z.record(z.string(), z.unknown()),
  stats: providerStatsView,
  healthOk: z.boolean().nullable(),
  healthDetail: z.string().nullable(),
  healthCheckedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProviderConfigView = z.infer<typeof providerConfigView>;

export const createProviderBody = z.object({
  key: z.enum(PROVIDER_KEYS),
  label: z.string().trim().min(2).max(60),
  enabled: z.boolean().default(false),
  priority: z.number().int().min(0).max(1000).default(100),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const updateProviderBody = z.object({
  label: z.string().trim().min(2).max(60).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  /** Shallow-merged into existing config. Send only the fields you change. */
  config: z.record(z.string(), z.unknown()).optional(),
});

export const reorderProvidersBody = z.object({ orderedIds: z.array(objectId).min(1) });
export const healthResultView = z.object({ ok: z.boolean(), detail: z.string().optional() });

/* ---------------- overview ---------------- */

export const adminOverview = z.object({
  usersTotal: z.number().int(),
  usersNew30d: z.number().int(),
  ordersTotal: z.number().int(),
  orders24h: z.number().int(),
  orders7d: z.number().int(),
  ordersByStatus: z.record(z.string(), z.number().int()),
  activeOrders: z.number().int(),
  successRate: z.number(),
  revenueMicro: z.number().int(),
  spendMicro: z.number().int(),
  refundMicro: z.number().int(),
  providerCostMicro: z.number().int(),
  grossMarginMicro: z.number().int(),
  series: z.array(
    z.object({
      date: z.string(),
      orders: z.number().int(),
      revenueMicro: z.number().int(),
      spendMicro: z.number().int(),
    }),
  ),
  providers: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      enabled: z.boolean(),
      priority: z.number().int(),
      healthOk: z.boolean().nullable(),
      rentSuccess: z.number().int(),
      rentError: z.number().int(),
      otpReceived: z.number().int(),
      successRate: z.number(),
      lastUsedAt: z.string().nullable(),
    }),
  ),
});
export type AdminOverview = z.infer<typeof adminOverview>;

/* ---------------- users ---------------- */

export const adminUserView = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  role: z.enum(['user', 'admin']),
  status: z.enum(['active', 'suspended']),
  balanceMicro: z.number().int(),
  ordersCount: z.number().int(),
  createdAt: z.string(),
});
export type AdminUserView = z.infer<typeof adminUserView>;

export const adminUsersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'active', 'suspended']).default('all'),
  role: z.enum(['all', 'user', 'admin']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminUserDetail = adminUserView.extend({
  affiliateCode: z.string(),
  recentOrders: z.array(
    z.object({
      id: z.string(),
      status: z.enum(ORDER_STATUSES),
      service: z.string(),
      country: z.string(),
      priceMicro: z.number().int(),
      createdAt: z.string(),
    }),
  ),
  recentTransactions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(TRANSACTION_TYPES),
      amountMicro: z.number().int(),
      description: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const updateUserBody = z.object({
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export const adjustBalanceBody = z.object({
  amountMicro: z.number().int().refine((n) => n !== 0, 'amount cannot be zero'),
  reason: z.string().trim().min(1).max(200),
});

/* ---------------- orders ---------------- */

export const adminOrderRow = z.object({
  id: z.string(),
  status: z.enum(ORDER_STATUSES),
  user: z.object({ id: z.string(), email: z.string() }),
  service: z.string(),
  country: z.string(),
  countryFlagEmoji: z.string(),
  phoneNumber: z.string(),
  priceMicro: z.number().int(),
  providerCostMicro: z.number().int().nullable(),
  provider: z.string(),
  providerLabel: z.string().nullable(),
  otpCode: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  expiresAt: z.string(),
  lastPolledAt: z.string().nullable(),
});
export type AdminOrderRow = z.infer<typeof adminOrderRow>;

export const adminOrdersQuery = z.object({
  status: z.enum(['all', ...ORDER_STATUSES, 'active']).default('all'),
  provider: z.string().trim().max(60).optional(),
  serviceId: objectId.optional(),
  countryId: objectId.optional(),
  userId: objectId.optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/* ---------------- catalog ---------------- */

export const adminServiceRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  iconKey: z.string(),
  aliases: z.array(z.string()),
  popular: z.boolean(),
  sortOrder: z.number().int(),
  offerCount: z.number().int(),
});
export const createServiceBody = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).min(2).max(40),
  name: z.string().trim().min(2).max(80),
  iconKey: z.string().trim().min(1).max(40),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  popular: z.boolean().default(false),
  sortOrder: z.number().int().default(1000),
});
export const updateServiceBody = createServiceBody.partial().omit({ slug: true });

export const adminCountryRow = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  dialCode: z.string(),
  flagEmoji: z.string(),
  sortOrder: z.number().int(),
  offerCount: z.number().int(),
});
export const createCountryBody = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z]{2}$/),
  name: z.string().trim().min(2).max(80),
  dialCode: z.string().trim().regex(/^\d{1,4}$/),
  flagEmoji: z.string().trim().min(1).max(8),
  sortOrder: z.number().int().default(1000),
});
export const updateCountryBody = createCountryBody.partial().omit({ code: true });

export const adminOfferRow = z.object({
  id: z.string(),
  serviceId: z.string(),
  serviceName: z.string(),
  countryId: z.string(),
  countryName: z.string(),
  operator: z.string().nullable(),
  priceMicro: z.number().int(),
  stock: z.number().int(),
  active: z.boolean(),
});
export const adminOffersQuery = z.object({
  serviceId: objectId.optional(),
  countryId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const createOfferBody = z.object({
  serviceId: objectId,
  countryId: objectId,
  operator: z.string().trim().max(40).nullable().default(null),
  priceMicro: z.number().int().min(0),
  stock: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export const updateOfferBody = z.object({
  priceMicro: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  operator: z.string().trim().max(40).nullable().optional(),
});
export const bulkOfferBody = z.object({
  serviceId: objectId.optional(),
  countryId: objectId.optional(),
  setPriceMicro: z.number().int().min(0).optional(),
  adjustPricePct: z.number().min(-90).max(1000).optional(),
  setStock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

/* ---------------- finance ---------------- */

export const adminTransactionRow = z.object({
  id: z.string(),
  user: z.object({ id: z.string(), email: z.string() }),
  type: z.enum(TRANSACTION_TYPES),
  amountMicro: z.number().int(),
  balanceAfterMicro: z.number().int(),
  description: z.string(),
  createdAt: z.string(),
});
export const adminTransactionsQuery = z.object({
  type: z.enum(['all', ...TRANSACTION_TYPES]).default('all'),
  userId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminDepositRow = z.object({
  id: z.string(),
  user: z.object({ id: z.string(), email: z.string() }),
  method: z.string(),
  amountMicro: z.number().int(),
  status: z.enum(DEPOSIT_STATUSES),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
});
export const adminDepositsQuery = z.object({
  status: z.enum(['all', ...DEPOSIT_STATUSES]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const updateDepositBody = z.object({ status: z.enum(['confirmed', 'failed']) });

/* ---------------- settings ---------------- */

export const settingsView = z.object({
  orderTtlSeconds: z.number().int().min(30).max(86_400),
  providerPollIntervalMs: z.number().int().min(1000).max(120_000),
  mockSmsSuccessRate: z.number().min(0).max(1),
  mockSmsMinDelayMs: z.number().int().min(0).max(600_000),
  mockSmsMaxDelayMs: z.number().int().min(0).max(600_000),
  affiliateRatePct: z.number().min(0).max(100),
  minDepositMicro: z.number().int().min(0),
  signupsEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
});
export type SettingsView = z.infer<typeof settingsView>;
export const settingsPatch = settingsView.partial();

/* ---------------- shared list helper ---------------- */

export const adminList = paginated;
