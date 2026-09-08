import * as yup from 'yup';
import { PROVIDER_KEYS } from '@smsgecko/shared';
import type { ProviderKey } from '@smsgecko/shared';
import { configObject, objectId } from '../common.schema.js';

export const createProviderBody = yup.object({
  key: yup.mixed<ProviderKey>().oneOf([...PROVIDER_KEYS]).required(),
  label: yup.string().trim().min(2).max(60).required(),
  enabled: yup.boolean().default(false),
  priority: yup.number().integer().min(0).max(1000).default(100),
  config: configObject.default(() => ({})),
});

export const updateProviderBody = yup.object({
  label: yup.string().trim().min(2).max(60).optional(),
  enabled: yup.boolean().optional(),
  priority: yup.number().integer().min(0).max(1000).optional(),
  /** Shallow-merged into existing config. Send only the fields you change. */
  config: configObject.optional(),
});

export const reorderProvidersBody = yup.object({
  orderedIds: yup.array().of(objectId.required()).min(1).required(),
});
