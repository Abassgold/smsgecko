import { EmailSuppression, type SuppressionReason } from '../models/EmailSuppression.js';
import { User } from '../models/User.js';
import { logger } from '../lib/logger.js';

interface SesRecipient {
  emailAddress?: string;
}

/** The parts of an SES bounce/complaint event we read. Same shape whether it
 *  arrives as an identity notification (`notificationType`) or a configuration-set
 *  event (`eventType`). */
interface SesEvent {
  notificationType?: string;
  eventType?: string;
  mail?: { messageId?: string };
  bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: SesRecipient[] };
  complaint?: { complaintFeedbackType?: string; complainedRecipients?: SesRecipient[] };
}

/** SES normally gives a bare address, but tolerate `Name <a@b.com>`. */
function bareAddress(raw: string | undefined): string | null {
  if (!raw) return null;
  const angle = /<([^>]+)>/.exec(raw);
  const address = (angle?.[1] ?? raw).toLowerCase().trim();
  return address.includes('@') ? address : null;
}

async function suppress(email: string, reason: SuppressionReason, detail: string | null, messageId: string | null) {
  const fields = { reason, detail, messageId };
  if (reason === 'bounce') {
    // A hard bounce is the stricter state, so it overwrites an earlier complaint.
    await EmailSuppression.updateOne({ email }, { $set: fields }, { upsert: true });
  } else {
    // A complaint must never downgrade an existing hard-bounce record.
    await EmailSuppression.updateOne({ email }, { $setOnInsert: fields }, { upsert: true });
    await User.updateMany({ email }, { $set: { unsubscribedFromBroadcasts: true } });
  }
}

/**
 * Apply one SES notification (the JSON inside an SNS `Message`). Permanent
 * bounces and complaints add the address to the suppression list; everything
 * else (deliveries, transient bounces, SES setup messages) is ignored.
 * Returns how many addresses were suppressed.
 */
export async function handleSesNotification(message: string): Promise<number> {
  let event: SesEvent;
  try {
    event = JSON.parse(message) as SesEvent;
  } catch {
    logger.warn('[ses] ignoring SNS notification whose Message is not JSON');
    return 0;
  }

  const type = event.notificationType ?? event.eventType;
  const messageId = event.mail?.messageId ?? null;
  let suppressed = 0;

  if (type === 'Bounce' && event.bounce?.bounceType === 'Permanent') {
    for (const r of event.bounce.bouncedRecipients ?? []) {
      const email = bareAddress(r.emailAddress);
      if (!email) continue;
      await suppress(email, 'bounce', event.bounce.bounceSubType ?? null, messageId);
      suppressed += 1;
    }
  } else if (type === 'Complaint') {
    for (const r of event.complaint?.complainedRecipients ?? []) {
      const email = bareAddress(r.emailAddress);
      if (!email) continue;
      await suppress(email, 'complaint', event.complaint?.complaintFeedbackType ?? null, messageId);
      suppressed += 1;
    }
  }

  if (suppressed > 0) logger.info({ type, suppressed }, '[ses] addresses suppressed');
  return suppressed;
}
