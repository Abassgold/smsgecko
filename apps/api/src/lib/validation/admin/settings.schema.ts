import * as yup from 'yup';
import type { SettingsPatch } from '@smsgecko/shared';

/** All fields optional — a PATCH merges over the current settings. */
export const settingsPatch = yup.object({
  orderTtlSeconds: yup.number().integer().min(30).max(86_400).optional(),
  providerPollIntervalMs: yup.number().integer().min(1000).max(120_000).optional(),
  mockSmsSuccessRate: yup.number().min(0).max(1).optional(),
  mockSmsMinDelayMs: yup.number().integer().min(0).max(600_000).optional(),
  mockSmsMaxDelayMs: yup.number().integer().min(0).max(600_000).optional(),
  affiliateRatePct: yup.number().min(0).max(100).optional(),
  minDepositMicro: yup.number().integer().min(0).optional(),
  signupsEnabled: yup.boolean().optional(),
  maintenanceMode: yup.boolean().optional(),
});

export type { SettingsPatch };
