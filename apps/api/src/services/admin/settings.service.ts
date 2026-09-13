import { updateSettings, type ResolvedSettings } from '../../lib/settings.js';
import { logAdminAction } from '../../lib/adminLog.js';

export async function applySettingsPatch(
  patch: Partial<ResolvedSettings>,
  actingUserId: string,
): Promise<ResolvedSettings> {
  const result = await updateSettings(patch);
  const changes = Object.entries(patch).map(([k, v]) => `${k}: ${v}`);
  if (changes.length) {
    void logAdminAction(actingUserId, 'settings_update', { type: 'settings' }, changes.join(', '));
  }
  return result;
}
