import { EmailSuppression } from '../models/EmailSuppression.js';

export type EmailCategory = 'transactional' | 'broadcast';

const normalize = (email: string) => email.toLowerCase().trim();

/**
 * Whether we must not send `category` mail to `email`. A hard bounce blocks
 * everything; a spam complaint only blocks broadcasts (see models/EmailSuppression).
 */
export async function isSuppressed(email: string, category: EmailCategory): Promise<boolean> {
  const record = await EmailSuppression.findOne({ email: normalize(email) }).select('reason').lean();
  if (!record) return false;
  return record.reason === 'bounce' || category === 'broadcast';
}
