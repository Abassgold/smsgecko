import type { OrderSource, OrderStatus, TransactionType, DepositStatus } from '../constants';

/* ---------------- providers ---------------- */

export const PROVIDER_KEYS = [
  'custom_http',
  'hero_sms',
  'daisy_sms',
  'sms_bower',
  'sms_code',
  'sms_pool',
] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

export interface ProviderStatsView {
  rentAttempts: number;
  rentSuccess: number;
  rentNoStock: number;
  rentError: number;
  otpReceived: number;
  lastUsedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface ProviderConfigView {
  id: string;
  key: ProviderKey;
  label: string;
  enabled: boolean;
  priority: number;
  /** Adapter config with secret-looking values masked ("••••1234"). */
  config: Record<string, unknown>;
  stats: ProviderStatsView;
  healthOk: boolean | null;
  healthDetail: string | null;
  healthCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HealthResultView {
  ok: boolean;
  detail?: string;
}

/* ---------------- overview ---------------- */

export interface AdminOverview {
  usersTotal: number;
  usersNew30d: number;
  ordersTotal: number;
  orders24h: number;
  orders7d: number;
  ordersByStatus: Record<string, number>;
  activeOrders: number;
  successRate: number;
  revenueMicro: number;
  spendMicro: number;
  refundMicro: number;
  providerCostMicro: number;
  grossMarginMicro: number;
  series: Array<{
    date: string;
    orders: number;
    revenueMicro: number;
    spendMicro: number;
  }>;
  providers: Array<{
    id: string;
    label: string;
    enabled: boolean;
    priority: number;
    healthOk: boolean | null;
    rentSuccess: number;
    rentError: number;
    otpReceived: number;
    successRate: number;
    lastUsedAt: string | null;
  }>;
}

/* ---------------- users ---------------- */

export interface AdminUserView {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  isVerified: boolean;
  balanceMicro: number;
  ordersCount: number;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserView {
  affiliateCode: string;
  recentOrders: Array<{
    id: string;
    status: OrderStatus;
    source: OrderSource;
    service: string;
    country: string;
    priceMicro: number;
    createdAt: string;
  }>;
  recentTransactions: Array<{
    id: string;
    type: TransactionType;
    amountMicro: number;
    description: string;
    createdAt: string;
  }>;
}

/* ---------------- orders ---------------- */

export interface AdminOrderRow {
  id: string;
  status: OrderStatus;
  source: OrderSource;
  user: { id: string; email: string };
  service: string;
  country: string;
  countryFlagEmoji: string;
  phoneNumber: string;
  priceMicro: number;
  /** Buyer's wallet balance immediately before / after the order_payment debit. Null for orders with no linked payment. */
  balanceBeforeMicro: number | null;
  balanceAfterMicro: number | null;
  providerCostMicro: number | null;
  provider: string;
  providerLabel: string | null;
  otpCode: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  lastPolledAt: string | null;
}

/* ---------------- finance ---------------- */

export interface AdminTransactionRow {
  id: string;
  user: { id: string; email: string };
  type: TransactionType;
  amountMicro: number;
  /** Wallet balance immediately before / after this entry. */
  balanceBeforeMicro: number;
  balanceAfterMicro: number;
  description: string;
  createdAt: string;
}

export interface AdminDepositRow {
  id: string;
  user: { id: string; email: string };
  method: string;
  amountMicro: number;
  status: DepositStatus;
  createdAt: string;
  confirmedAt: string | null;
}

/* ---------------- settings ---------------- */

export interface SettingsView {
  orderTtlSeconds: number;
  providerPollIntervalMs: number;
  affiliateRatePct: number;
  minDepositMicro: number;
  numberMarkupPercent: number;
  numberMarkupFlatMicro: number;
  signupsEnabled: boolean;
  maintenanceMode: boolean;
}

export type SettingsPatch = Partial<SettingsView>;
