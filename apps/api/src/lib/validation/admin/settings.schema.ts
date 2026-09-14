import * as yup from 'yup';
import type { SettingsPatch } from '@smsgecko/shared';

/** All fields optional — a PATCH merges over the current settings. */
export const settingsPatch = yup.object({
  orderTtlSeconds: yup.number().integer().min(30).max(86_400).optional(),
  providerPollIntervalMs: yup.number().integer().min(1000).max(120_000).optional(),
  affiliateRatePct: yup.number().min(0).max(100).optional(),
  minDepositMicro: yup.number().integer().min(0).optional(),
  numberMarkupPercent: yup.number().min(0).max(1000).optional(),
  numberMarkupFlatMicro: yup.number().integer().min(0).optional(),
  usdToNgnRate: yup.number().min(1).optional(),
  signupsEnabled: yup.boolean().optional(),
  maintenanceMode: yup.boolean().optional(),
});

export type { SettingsPatch };
