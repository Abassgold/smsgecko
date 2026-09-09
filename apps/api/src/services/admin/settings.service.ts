import { updateSettings, type ResolvedSettings } from '../../lib/settings.js';

export async function applySettingsPatch(
  patch: Partial<ResolvedSettings>,
): Promise<ResolvedSettings> {
  return updateSettings(patch);
}
