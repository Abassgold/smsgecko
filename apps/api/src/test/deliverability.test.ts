import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeAdmin, makeUser } from './factories.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import * as email from '../lib/email.js';
import { sendEmail } from '../lib/email.js';
import { signUnsubscribeToken } from '../lib/broadcastUnsubscribe.js';
import { domainCanReceiveMail, type MailResolver } from '../lib/emailValidation.js';
import { verifySnsMessage } from '../lib/sns.js';
import { runBroadcasts } from '../workers/index.js';
import { Broadcast } from '../models/Broadcast.js';
import { EmailSuppression } from '../models/EmailSuppression.js';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';

// Signature verification has its own unit tests (sns.test.ts, real keys). Here we
// stub it so the endpoint's behaviour can be driven with plain JSON.
vi.mock('../lib/sns.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sns.js')>();
  return { ...actual, verifySnsMessage: vi.fn(async () => true) };
});

const TOPIC = 'arn:aws:sns:eu-north-1:123456789012:ses-events';
const CERT_URL = 'https://sns.eu-north-1.amazonaws.com/cert.pem';
const ENDPOINT = '/api/v1/ses/notifications';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
beforeEach(() => {
  env.SES_SNS_TOPIC_ARN = TOPIC;
});
afterEach(() => {
  env.SES_SNS_TOPIC_ARN = undefined;
  vi.restoreAllMocks();
  vi.mocked(verifySnsMessage).mockResolvedValue(true);
});
afterAll(async () => {
  // express app needs no teardown
});

const envelope = (sesEvent: object, extra: Record<string, unknown> = {}) => ({
  Type: 'Notification',
  MessageId: 'sns-1',
  TopicArn: TOPIC,
  Message: JSON.stringify(sesEvent),
  Timestamp: new Date().toISOString(),
  SignatureVersion: '2',
  Signature: 'sig',
  SigningCertURL: CERT_URL,
  ...extra,
});

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  inject({ method: 'POST', url: ENDPOINT, payload, headers });

const bounce = (address: string, bounceType = 'Permanent') => ({
  notificationType: 'Bounce',
  mail: { messageId: 'ses-msg-1' },
  bounce: { bounceType, bounceSubType: 'General', bouncedRecipients: [{ emailAddress: address }] },
});
const complaint = (address: string) => ({
  notificationType: 'Complaint',
  mail: { messageId: 'ses-msg-2' },
  complaint: { complaintFeedbackType: 'abuse', complainedRecipients: [{ emailAddress: address }] },
});

const send = (to: string, category?: 'transactional' | 'broadcast') =>
  sendEmail({ to, subject: 's', html: '<p>x</p>', text: 'x', category });

describe('SES notification endpoint', () => {
  it('returns 503 until a topic ARN is configured', async () => {
    env.SES_SNS_TOPIC_ARN = undefined;
    expect((await post(envelope(bounce('a@test.dev')))).statusCode).toBe(503);
  });

  it('rejects a message from a different topic', async () => {
    const res = await post(envelope(bounce('a@test.dev'), { TopicArn: 'arn:aws:sns:eu-north-1:999:other' }));
    expect(res.statusCode).toBe(403);
    expect(await EmailSuppression.countDocuments()).toBe(0);
  });

  it('rejects a bad signature without acting on it', async () => {
    vi.mocked(verifySnsMessage).mockResolvedValueOnce(false);
    const res = await post(envelope(bounce('a@test.dev')));
    expect(res.statusCode).toBe(403);
    expect(await EmailSuppression.countDocuments()).toBe(0);
  });

  it('rejects a body that is not an SNS message', async () => {
    expect((await post({ hello: 'world' })).statusCode).toBe(400);
  });

  it('accepts the text/plain body SNS really sends', async () => {
    const res = await post(JSON.stringify(envelope(bounce('plain@test.dev'))), {
      'content-type': 'text/plain; charset=UTF-8',
    });
    expect(res.statusCode).toBe(200);
    expect(await EmailSuppression.exists({ email: 'plain@test.dev' })).toBeTruthy();
  });

  it('suppresses a permanently bounced address and stops all mail to it', async () => {
    const res = await post(envelope(bounce('Gone@Test.dev')));
    expect(res.statusCode).toBe(200);
    const record = await EmailSuppression.findOne({ email: 'gone@test.dev' });
    expect(record).toMatchObject({ reason: 'bounce', detail: 'General', messageId: 'ses-msg-1' });

    expect(await send('gone@test.dev')).toBe(false);
    expect(await send('gone@test.dev', 'broadcast')).toBe(false);
    expect(await send('someone.else@test.dev')).toBe(true);
  });

  it('ignores transient bounces and non-bounce events', async () => {
    await post(envelope(bounce('soft@test.dev', 'Transient')));
    await post(envelope({ notificationType: 'Delivery', mail: {} }));
    await post(envelope({ eventType: 'Send', mail: {} }));
    expect(await EmailSuppression.countDocuments()).toBe(0);
    expect(await send('soft@test.dev')).toBe(true);
  });

  it('reads configuration-set events (eventType) as well as identity notifications', async () => {
    const { notificationType: _unused, ...rest } = bounce('cfg@test.dev');
    await post(envelope({ ...rest, eventType: 'Bounce' }));
    expect(await EmailSuppression.exists({ email: 'cfg@test.dev', reason: 'bounce' })).toBeTruthy();
  });

  it('a complaint stops broadcasts and unsubscribes the user, but not account mail', async () => {
    const { userId, email: address } = await makeUser(app);
    await post(envelope(complaint(address)));

    expect(await EmailSuppression.findOne({ email: address })).toMatchObject({ reason: 'complaint', detail: 'abuse' });
    expect((await User.findById(userId))?.unsubscribedFromBroadcasts).toBe(true);
    expect(await send(address, 'broadcast')).toBe(false);
    expect(await send(address, 'transactional')).toBe(true);
  });

  it('a complaint never downgrades a bounce, but a bounce upgrades a complaint', async () => {
    await post(envelope(bounce('both@test.dev')));
    await post(envelope(complaint('both@test.dev')));
    expect((await EmailSuppression.findOne({ email: 'both@test.dev' }))?.reason).toBe('bounce');

    await post(envelope(complaint('other@test.dev')));
    expect((await EmailSuppression.findOne({ email: 'other@test.dev' }))?.reason).toBe('complaint');
    await post(envelope(bounce('other@test.dev')));
    expect((await EmailSuppression.findOne({ email: 'other@test.dev' }))?.reason).toBe('bounce');
  });

  it('confirms a subscription by visiting the SNS SubscribeURL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const url = 'https://sns.eu-north-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc';
    const res = await post(envelope({}, { Type: 'SubscriptionConfirmation', SubscribeURL: url, Token: 'abc' }));
    expect(res.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(url, expect.anything());
  });

  it('refuses to visit a SubscribeURL that is not an SNS host', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await post(
      envelope({}, { Type: 'SubscriptionConfirmation', SubscribeURL: 'http://169.254.169.254/latest', Token: 'abc' }),
    );
    expect(res.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('signup and resend protections', () => {
  const register = (address: string) =>
    inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: address, password: 'supersecret1' } });

  it('refuses role mailboxes like postmaster@ and abuse@', async () => {
    for (const address of ['postmaster@test.dev', 'Abuse@test.dev', 'noreply@test.dev']) {
      const res = await register(address);
      expect(res.statusCode).toBe(400);
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it('refuses an address that already hard-bounced', async () => {
    await post(envelope(bounce('bounced@test.dev')));
    const res = await register('bounced@test.dev');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/different one/);
    expect(await User.countDocuments()).toBe(0);
  });

  it('throttles the resend-verification button per account', async () => {
    const reg = await register('resend@test.dev');
    expect(reg.statusCode).toBe(201);
    const cookie = reg.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const resend = () => inject({ method: 'POST', url: '/api/v1/auth/resend-verification', headers: { cookie } });

    // Signup just sent one, so an immediate resend is throttled.
    const tooSoon = await resend();
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json().error.code).toBe('RATE_LIMITED');

    // Once the cooldown has passed it goes through. (Raw collection: mongoose
    // treats createdAt as immutable and would drop the update.)
    await EmailToken.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 120_000) } });
    expect((await resend()).statusCode).toBe(200);
  });

  it('throttles forgot-password silently, with an identical response', async () => {
    await register('forgot@test.dev');
    const sendSpy = vi.spyOn(email, 'sendPasswordResetEmail').mockResolvedValue(undefined);
    const forgot = () =>
      inject({ method: 'POST', url: '/api/v1/auth/forgot-password', payload: { email: 'forgot@test.dev' } });

    const first = await forgot();
    const second = await forgot();
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

describe('domainCanReceiveMail', () => {
  const noRecord = () => Promise.reject(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }));
  const resolver = (over: Partial<MailResolver>): MailResolver => ({
    resolveMx: noRecord,
    resolve4: noRecord,
    resolve6: noRecord,
    ...over,
  });

  it('accepts a domain with an MX record', async () => {
    const r = resolver({ resolveMx: async () => [{ exchange: 'mx.example.com', priority: 10 }] });
    expect(await domainCanReceiveMail('example.com', r)).toBe(true);
  });

  it('falls back to an A record (implicit MX)', async () => {
    expect(await domainCanReceiveMail('a-only.com', resolver({ resolve4: async () => ['1.2.3.4'] }))).toBe(true);
  });

  it('rejects a domain with no mail records, and a null MX', async () => {
    expect(await domainCanReceiveMail('typo.invalid', resolver({}))).toBe(false);
    const nullMx = resolver({ resolveMx: async () => [{ exchange: '.', priority: 0 }] });
    expect(await domainCanReceiveMail('nomail.com', nullMx)).toBe(false);
  });

  it('fails open when DNS itself is broken, so an outage never blocks signups', async () => {
    const broken = resolver({ resolveMx: () => Promise.reject(Object.assign(new Error('x'), { code: 'ESERVFAIL' })) });
    expect(await domainCanReceiveMail('example.com', broken)).toBe(true);
  });
});

describe('one-click unsubscribe', () => {
  it('handles the POST that Gmail/Yahoo send for List-Unsubscribe-Post', async () => {
    const { userId } = await makeUser(app);
    const token = signUnsubscribeToken(userId);
    const res = await inject({
      method: 'POST',
      url: `/api/v1/unsubscribe?token=${encodeURIComponent(token)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });
    expect(res.statusCode).toBe(200);
    expect((await User.findById(userId))?.unsubscribedFromBroadcasts).toBe(true);
  });

  it('answers 200 but changes nothing for a forged token', async () => {
    const { userId } = await makeUser(app);
    const res = await inject({ method: 'POST', url: `/api/v1/unsubscribe?token=${userId}.deadbeef` });
    expect(res.statusCode).toBe(200);
    expect((await User.findById(userId))?.unsubscribedFromBroadcasts).toBe(false);
  });
});

describe('broadcast audience', () => {
  it('only emails verified, unsuppressed users — even for audience "all"', async () => {
    const admin = await makeAdmin(app);
    const verified = await makeUser(app);
    const unverified = await makeUser(app);
    const bounced = await makeUser(app);
    await User.updateOne({ _id: unverified.userId }, { $set: { isVerified: false } });
    await EmailSuppression.create({ email: bounced.email, reason: 'bounce' });

    const job = await Broadcast.create({ subject: 'Hi', body: 'Hello', audience: 'all', createdBy: admin.userId });
    const sendSpy = vi.spyOn(email, 'sendBroadcastEmail');
    for (let i = 0; i < 10; i++) {
      await runBroadcasts(logger);
      if ((await Broadcast.findById(job._id))?.status === 'completed') break;
    }

    const recipients = sendSpy.mock.calls.map((c) => c[0]);
    expect(recipients).toContain(verified.email);
    expect(recipients).not.toContain(unverified.email);

    const done = await Broadcast.findById(job._id);
    expect(done?.status).toBe('completed');
    // The admin and `verified` were sent; the bounced address was skipped, which
    // counts as neither sent nor failed.
    expect(done?.sentCount).toBe(2);
    expect(done?.failedCount).toBe(0);
  });
});
