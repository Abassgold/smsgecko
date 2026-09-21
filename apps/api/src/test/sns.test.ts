import { describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { isTrustedSnsUrl, parseSnsMessage, verifySnsMessage, type SnsMessage } from '../lib/sns.js';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CERT_URL = 'https://sns.eu-north-1.amazonaws.com/SimpleNotificationService-abc123.pem';
const resolver = async () => pair.publicKey;

/** Build a message signed the way SNS does, so we exercise the real verification path. */
function signed(overrides: Partial<SnsMessage> = {}, version: '1' | '2' = '2'): SnsMessage {
  const msg: SnsMessage = {
    Type: 'Notification',
    MessageId: 'msg-1',
    TopicArn: 'arn:aws:sns:eu-north-1:123456789012:ses-events',
    Message: '{"notificationType":"Bounce"}',
    Timestamp: '2026-09-21T12:00:00.000Z',
    SignatureVersion: version,
    Signature: '',
    SigningCertURL: CERT_URL,
    ...overrides,
  };
  const lines = [`Message\n${msg.Message}\n`, `MessageId\n${msg.MessageId}\n`];
  if (msg.Subject !== undefined) lines.push(`Subject\n${msg.Subject}\n`);
  lines.push(`Timestamp\n${msg.Timestamp}\n`, `TopicArn\n${msg.TopicArn}\n`, `Type\n${msg.Type}\n`);
  msg.Signature = createSign(version === '2' ? 'RSA-SHA256' : 'RSA-SHA1')
    .update(lines.join(''))
    .sign(pair.privateKey, 'base64');
  return msg;
}

describe('SNS signature verification', () => {
  it('accepts a correctly signed message (SHA256 and SHA1)', async () => {
    expect(await verifySnsMessage(signed({}, '2'), resolver)).toBe(true);
    expect(await verifySnsMessage(signed({}, '1'), resolver)).toBe(true);
  });

  it('includes Subject in the signed string when present', async () => {
    expect(await verifySnsMessage(signed({ Subject: 'Amazon SES Email Event' }), resolver)).toBe(true);
    const msg = signed({ Subject: 'Amazon SES Email Event' });
    expect(await verifySnsMessage({ ...msg, Subject: 'tampered' }, resolver)).toBe(false);
  });

  it('rejects a message whose body was altered after signing', async () => {
    const msg = signed();
    expect(await verifySnsMessage({ ...msg, Message: '{"notificationType":"Complaint"}' }, resolver)).toBe(false);
  });

  it('rejects a signature made by a different key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(await verifySnsMessage(signed(), async () => other.publicKey)).toBe(false);
  });

  it('never fetches a certificate from a host that is not SNS', async () => {
    const resolve = vi.fn(resolver);
    for (const url of [
      'https://evil.example.com/cert.pem',
      'http://sns.eu-north-1.amazonaws.com/cert.pem',
      'https://sns.eu-north-1.amazonaws.com.evil.com/cert.pem',
      'https://sns.eu-north-1.amazonaws.com:8443/cert.pem',
      'https://sns.eu-north-1.amazonaws.com/cert.txt',
    ]) {
      expect(await verifySnsMessage(signed({ SigningCertURL: url }), resolve)).toBe(false);
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects an unknown signature version and a failing key fetch', async () => {
    expect(await verifySnsMessage({ ...signed(), SignatureVersion: '3' }, resolver)).toBe(false);
    expect(
      await verifySnsMessage(signed(), async () => {
        throw new Error('network down');
      }),
    ).toBe(false);
  });
});

describe('SNS helpers', () => {
  it('isTrustedSnsUrl only allows https SNS regional hosts', () => {
    expect(isTrustedSnsUrl('https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription')).toBe(true);
    expect(isTrustedSnsUrl('https://sns.cn-north-1.amazonaws.com.cn/x')).toBe(true);
    expect(isTrustedSnsUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isTrustedSnsUrl('https://amazonaws.com/x')).toBe(false);
    expect(isTrustedSnsUrl('not a url')).toBe(false);
    expect(isTrustedSnsUrl(undefined)).toBe(false);
  });

  it('parseSnsMessage requires every signed field and a known Type', () => {
    expect(parseSnsMessage(signed())).not.toBeNull();
    expect(parseSnsMessage({ ...signed(), Signature: undefined })).toBeNull();
    expect(parseSnsMessage({ ...signed(), Type: 'Other' })).toBeNull();
    expect(parseSnsMessage('nope')).toBeNull();
    expect(parseSnsMessage(null)).toBeNull();
  });
});
