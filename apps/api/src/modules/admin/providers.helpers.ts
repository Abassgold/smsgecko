import { decryptJson, maskSecret } from '../../lib/secretbox.js';
import type { ProviderConfigDoc } from '../../models/ProviderConfig.js';

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
    healthOk: cfg.healthOk ?? null,
    healthDetail: cfg.healthDetail ?? null,
    healthCheckedAt: cfg.healthCheckedAt ? cfg.healthCheckedAt.toISOString() : null,
    createdAt: (cfg.get('createdAt') as Date).toISOString(),
    updatedAt: (cfg.get('updatedAt') as Date).toISOString(),
  };
}

/**
 * Merge a partial config patch into the stored (decrypted) config, dropping
 * masked placeholders so an unchanged secret keeps its real value.
 */
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
