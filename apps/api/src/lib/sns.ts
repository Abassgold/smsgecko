import { createVerify, X509Certificate, type KeyObject } from 'node:crypto';

/** The fields of an Amazon SNS HTTP(S) delivery that we read. */
export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/**
 * Only ever fetch a certificate or confirmation URL from a real SNS endpoint.
 * The URLs come from the (still unverified) request body, so without this an
 * attacker could point us at their own cert — or at an internal address.
 */
export function isTrustedSnsUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.port === '' && SNS_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/** Narrow an unknown parsed body to an SnsMessage, or null if a required field is missing. */
export function parseSnsMessage(raw: unknown): SnsMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const required = ['Type', 'MessageId', 'TopicArn', 'Message', 'Timestamp', 'SignatureVersion', 'Signature', 'SigningCertURL'];
  if (!required.every((k) => typeof m[k] === 'string')) return null;
  if (!['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation'].includes(m.Type as string)) return null;
  return m as unknown as SnsMessage;
}

const NOTIFICATION_FIELDS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const;
const CONFIRMATION_FIELDS = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'] as const;

/** The canonical string SNS signs: `Key\nValue\n` for each field, in a fixed order, skipping absent ones. */
function stringToSign(msg: SnsMessage): string {
  const fields = msg.Type === 'Notification' ? NOTIFICATION_FIELDS : CONFIRMATION_FIELDS;
  const record = msg as unknown as Record<string, string | undefined>;
  return fields
    .filter((f) => record[f] !== undefined)
    .map((f) => `${f}\n${record[f]}\n`)
    .join('');
}

export type SigningKeyResolver = (certUrl: string) => Promise<KeyObject>;

const keyCache = new Map<string, KeyObject>();

export const fetchSigningKey: SigningKeyResolver = async (certUrl) => {
  const cached = keyCache.get(certUrl);
  if (cached) return cached;
  const res = await fetch(certUrl, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`SNS signing cert fetch failed: ${res.status}`);
  const key = new X509Certificate(await res.text()).publicKey;
  keyCache.set(certUrl, key);
  return key;
};

/**
 * Verify an SNS message's signature against Amazon's signing certificate.
 * Never throws — anything wrong (bad host, bad cert, bad signature) is `false`.
 */
export async function verifySnsMessage(
  msg: SnsMessage,
  resolveKey: SigningKeyResolver = fetchSigningKey,
): Promise<boolean> {
  if (msg.SignatureVersion !== '1' && msg.SignatureVersion !== '2') return false;
  if (!isTrustedSnsUrl(msg.SigningCertURL) || !new URL(msg.SigningCertURL).pathname.endsWith('.pem')) return false;
  try {
    const key = await resolveKey(msg.SigningCertURL);
    const verifier = createVerify(msg.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1');
    verifier.update(stringToSign(msg), 'utf8');
    return verifier.verify(key, msg.Signature, 'base64');
  } catch {
    return false;
  }
}
