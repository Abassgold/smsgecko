import type { ProviderKey } from '@smsgecko/shared';
import { decryptJson, encryptJson, maskSecret } from '../../lib/secretbox.js';
import { ProviderConfig, type ProviderConfigDoc } from '../../models/ProviderConfig.js';
import { Order } from '../../models/Order.js';
import { bustProviderCache, runHealthCheck } from '../../providers/sms/registry.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import {
  ENV_CREDENTIAL_FIELDS,
  envVarNames,
  isEnvProvider,
  missingEnvVars,
} from '../../lib/providerEnv.js';

/** Keys whose *value* should be masked in admin responses. */
const SECRET_KEY_RE = /(api[_-]?key|key|secret|token|password|passwd|credential)$/i;

/** Decrypt a provider's stored config and mask secret-looking string values. */
export function maskedConfig(cfg: ProviderConfigDoc): Record<string, unknown> {
  const raw = decryptJson<Record<string, unknown>>(cfg.configEnc);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = typeof v === 'string' && SECRET_KEY_RE.test(k) ? maskSecret(v) : v;
  }
  return out;
}

export function toProviderView(cfg: ProviderConfigDoc) {
  const stats = cfg.stats ?? {};
  return {
    id: cfg.id as string,
    key: cfg.key,
    label: cfg.label,
    enabled: cfg.enabled,
    priority: cfg.priority,
    config: maskedConfig(cfg),
    stats: {
      rentAttempts: stats.rentAttempts ?? 0,
      rentSuccess: stats.rentSuccess ?? 0,
      rentNoStock: stats.rentNoStock ?? 0,
      rentError: stats.rentError ?? 0,
      otpReceived: stats.otpReceived ?? 0,
      lastUsedAt: stats.lastUsedAt ? new Date(stats.lastUsedAt).toISOString() : null,
      lastError: stats.lastError ?? null,
      lastErrorAt: stats.lastErrorAt ? new Date(stats.lastErrorAt).toISOString() : null,
    },
    // Resellers read their key from env: which vars it uses, and which are unset.
    envVars: envVarNames(cfg.key),
    missingEnvVars: missingEnvVars(cfg.key),
    healthOk: cfg.healthOk ?? null,
    healthDetail: cfg.healthDetail ?? null,
    healthCheckedAt: cfg.healthCheckedAt ? cfg.healthCheckedAt.toISOString() : null,
    createdAt: (cfg.get('createdAt') as Date).toISOString(),
    updatedAt: (cfg.get('updatedAt') as Date).toISOString(),
  };
}

export function mergeConfigPatch(
  cfg: ProviderConfigDoc,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const current = decryptJson<Record<string, unknown>>(cfg.configEnc);
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'string' && v.startsWith('••••')) continue; // untouched masked value
    next[k] = v;
  }
  return next;
}

export interface CreateProviderInput {
  key: ProviderKey;
  label: string;
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
}

export interface UpdateProviderInput {
  label?: string;
  enabled?: boolean;
  priority?: number;
  config?: Record<string, unknown>;
}

/** A reseller can only be switched on once its env credentials are set. */
function assertCanEnable(key: string): void {
  const missing = missingEnvVars(key);
  if (missing.length) {
    throw badRequest(`Set ${missing.join(' and ')} in the API environment (Render → Environment), then try again`);
  }
}

/** Env-backed resellers never persist credentials — drop any that were sent. */
function withoutCredentials(key: string, config: Record<string, unknown>): Record<string, unknown> {
  if (!isEnvProvider(key)) return config;
  const out = { ...config };
  for (const f of ENV_CREDENTIAL_FIELDS) delete out[f];
  return out;
}

async function sortedConfigs(): Promise<ProviderConfigDoc[]> {
  return ProviderConfig.find().sort({ priority: 1, createdAt: 1 });
}

export async function listProviders() {
  return (await sortedConfigs()).map(toProviderView);
}

export async function createProvider(body: CreateProviderInput) {
  if (await ProviderConfig.exists({ label: body.label })) {
    throw conflict('A provider with that label already exists');
  }
  if (body.enabled) assertCanEnable(body.key);
  const cfg = await ProviderConfig.create({
    key: body.key,
    label: body.label,
    enabled: body.enabled,
    priority: body.priority,
    configEnc: encryptJson(withoutCredentials(body.key, body.config ?? {})),
  });
  if (cfg.enabled) await disableOthers(cfg._id);
  bustProviderCache();
  return toProviderView(cfg);
}

/** Only one provider is active at a time — turning one on turns the rest off. */
async function disableOthers(keepId: unknown): Promise<void> {
  await ProviderConfig.updateMany(
    { _id: { $ne: keepId }, enabled: true },
    { $set: { enabled: false } },
  );
}

export async function getProvider(id: string) {
  const cfg = await ProviderConfig.findById(id);
  if (!cfg) throw notFound('Provider not found');
  return toProviderView(cfg);
}

export async function updateProvider(id: string, body: UpdateProviderInput) {
  const cfg = await ProviderConfig.findById(id);
  if (!cfg) throw notFound('Provider not found');

  if (body.label !== undefined) {
    if (await ProviderConfig.exists({ label: body.label, _id: { $ne: cfg._id } })) {
      throw conflict('A provider with that label already exists');
    }
    cfg.label = body.label;
  }
  if (body.enabled !== undefined) cfg.enabled = body.enabled;
  if (body.priority !== undefined) cfg.priority = body.priority;
  if (body.config !== undefined) {
    cfg.configEnc = encryptJson(withoutCredentials(cfg.key, mergeConfigPatch(cfg, body.config)));
  }
  if (body.enabled) assertCanEnable(cfg.key);
  await cfg.save();
  if (cfg.enabled) await disableOthers(cfg._id);
  bustProviderCache();
  return toProviderView(cfg);
}

export async function deleteProvider(id: string) {
  const cfg = await ProviderConfig.findById(id);
  if (!cfg) throw notFound('Provider not found');
  const active = await Order.countDocuments({ providerConfigId: cfg._id, status: 'waiting' });
  if (active > 0) {
    throw badRequest(`${active} order(s) are still waiting on this provider — disable it instead`);
  }
  await cfg.deleteOne();
  bustProviderCache();
}

export async function testProvider(id: string) {
  const cfg = await ProviderConfig.findById(id);
  if (!cfg) throw notFound('Provider not found');
  const result = await runHealthCheck(cfg);
  bustProviderCache();
  return result;
}

export async function reorderProviders(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, i) => ProviderConfig.updateOne({ _id: id }, { $set: { priority: i } })),
  );
  bustProviderCache();
  return (await sortedConfigs()).map(toProviderView);
}
