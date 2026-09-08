import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Symmetric encryption for provider credentials stored in Mongo.
 * AES-256-GCM. Key is `env.SETTINGS_ENC_KEY` (base64, 32 bytes). Blobs are
 * `v1.<iv b64>.<tag b64>.<ciphertext b64>`.
 */

function key(): Buffer {
  const raw = Buffer.from(env.SETTINGS_ENC_KEY, 'base64');
  if (raw.length === 32) return raw;
  // Accept any-length secret by hashing it to 32 bytes (dev convenience).
  return createHash('sha256').update(env.SETTINGS_ENC_KEY).digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value ?? {}), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptJson<T = Record<string, unknown>>(blob: string | null | undefined): T {
  if (!blob) return {} as T;
  const parts = blob.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return {} as T;
  try {
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    const ciphertext = Buffer.from(parts[3]!, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    return {} as T;
  }
}

/** "sk_live_1234abcd..." -> "••••abcd" for display. Empty/short -> "". */
export function maskSecret(value: unknown): string {
  const s = typeof value === 'string' ? value : '';
  if (s.length < 4) return s ? '••••' : '';
  return `••••${s.slice(-4)}`;
}

export function randomEncKey(): string {
  return randomBytes(32).toString('base64');
}
