import * as yup from 'yup';
import { KORAPAY_CURRENCIES } from '@smsgecko/shared';
import type { SettingsPatch } from '@smsgecko/shared';

/** All fields optional — a PATCH merges over the current settings. */
export const settingsPatch = yup.object({
  orderTtlSeconds: yup.number().integer().min(30).max(86_400).optional(),
  providerPollIntervalMs: yup.number().integer().min(1000).max(120_000).optional(),
  affiliateRatePct: yup.number().min(0).max(100).optional(),
  minDepositMicro: yup.number().integer().min(0).optional(),
  numberMarkupPercent: yup.number().min(0).max(1000).optional(),
  numberMarkupFlatMicro: yup.number().integer().min(0).optional(),
  // .default(undefined) — without it, yup's object schema silently defaults
  // an absent key to `{}` and then fails its own required sub-fields, so a
  // PATCH that doesn't touch korapayFxRates at all would 400.
  korapayFxRates: yup
    .object(
      Object.fromEntries(KORAPAY_CURRENCIES.map((c) => [c, yup.number().min(1).required()])),
    )
    .default(undefined)
    .optional(),
  signupsEnabled: yup.boolean().optional(),
  maintenanceMode: yup.boolean().optional(),
});

export type { SettingsPatch };
