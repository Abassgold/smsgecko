import { getSettings, updateSettings, type ResolvedSettings } from '../../lib/settings.js';
import { badRequest } from '../../lib/errors.js';

export async function applySettingsPatch(
  patch: Partial<ResolvedSettings>,
): Promise<ResolvedSettings> {
  const merged = { ...(await getSettings()), ...patch };
  if (merged.mockSmsMinDelayMs > merged.mockSmsMaxDelayMs) {
    throw badRequest('mockSmsMinDelayMs must be ≤ mockSmsMaxDelayMs');
  }
  return updateSettings(patch);
}
