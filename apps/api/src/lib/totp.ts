import { createHmac, randomBytes } from 'node:crypto';

/**
 * TOTP (RFC 6238) over HMAC-SHA1, the format every authenticator app
 * (Google Authenticator, Authy, 1Password, …) expects. Hand-rolled rather
 * than pulling in a dependency — it's ~40 lines of well-specified math.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** A fresh base32 secret, ready to hand to an authenticator app. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The code a compliant authenticator app would be showing right now. */
export function currentTotpCode(base32Secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  return hotp(base32Decode(base32Secret), counter);
}

/** Checks `code` against the current step and ±1 step (30s) of clock drift. */
export function verifyTotp(base32Secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let drift = -1; drift <= 1; drift++) {
    if (hotp(secret, counter + drift) === code) return true;
  }
  return false;
}

/** `otpauth://` URI an authenticator app can scan as a QR code. */
export function totpUri(base32Secret: string, email: string, issuer = 'SMSGecko'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
