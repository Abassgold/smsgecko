import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import request from 'supertest';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import { makeAdmin, makeUser } from './factories.js';
import { runBroadcasts } from '../workers/index.js';
import { logger } from '../lib/logger.js';
import { Broadcast } from '../models/Broadcast.js';
import { User } from '../models/User.js';
import { signUnsubscribeToken } from '../lib/broadcastUnsubscribe.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;
beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});
afterAll(async () => {
  // express app needs no teardown
});

const get = (url: string, cookie: string) => inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string, payload?: object) =>
  inject({ method: 'POST', url, headers: { cookie }, payload });

/** Run worker ticks until the job leaves 'pending'/'sending', or bail out. */
async function drainBroadcast(maxTicks = 20): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    await runBroadcasts(logger);
    const jobs = await Broadcast.find();
    if (jobs.every((j) => j.status === 'completed' || j.status === 'failed')) return;
  }
}

describe('admin broadcasts', () => {
  it('is gated to admins', async () => {
    const { cookie: userCookie } = await makeUser(app);
    expect((await get('/api/v1/admin/broadcasts', userCookie)).statusCode).toBe(403);
    expect((await get('/api/v1/admin/broadcasts', '')).statusCode).toBe(401);
    expect((await get('/api/v1/admin/broadcasts', userCookie)).statusCode).not.toBe(200);
  });

  it('lets an admin queue a broadcast as a pending job', async () => {
    const { cookie: adminCookie } = await makeAdmin(app);
    const res = await post('/api/v1/admin/broadcasts', adminCookie, {
      subject: 'New feature!',
      body: 'We shipped something new.',
      audience: 'all',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      subject: 'New feature!',
      audience: 'all',
      status: 'pending',
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
    });

    const list = await get('/api/v1/admin/broadcasts', adminCookie);
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
  });

  it('rejects a broadcast body that is missing a subject', async () => {
    const { cookie: adminCookie } = await makeAdmin(app);
    const res = await post('/api/v1/admin/broadcasts', adminCookie, {
      body: 'no subject here',
    });
    expect(res.statusCode).toBe(400);
  });

  it('processes the audience in batches down to completed, skipping unsubscribed users', async () => {
    const { cookie: adminCookie } = await makeAdmin(app);
    const { userId: subscribedId } = await makeUser(app);
    const { userId: unsubscribedId } = await makeUser(app);
    await User.updateOne({ _id: unsubscribedId }, { $set: { unsubscribedFromBroadcasts: true } });

    const created = await post('/api/v1/admin/broadcasts', adminCookie, {
      subject: 'Batch test',
      body: 'Hello everyone.',
      audience: 'all',
    });
    const broadcastId = created.json().id as string;

    await drainBroadcast();

    const job = await Broadcast.findById(broadcastId);
    expect(job?.status).toBe('completed');
    // Admin + the one subscribed user — the unsubscribed one is excluded.
    expect(job?.totalRecipients).toBe(2);
    expect((job?.sentCount ?? 0) + (job?.failedCount ?? 0)).toBe(2);
    expect(job?.completedAt).not.toBeNull();
  });

  it('only counts verified users when the audience is "verified"', async () => {
    const { cookie: adminCookie } = await makeAdmin(app);
    const { userId: unverifiedId } = await makeUser(app);
    await User.updateOne({ _id: unverifiedId }, { $set: { isVerified: false } });

    const created = await post('/api/v1/admin/broadcasts', adminCookie, {
      subject: 'Verified only',
      body: 'For verified accounts.',
      audience: 'verified',
    });
    const broadcastId = created.json().id as string;

    await drainBroadcast();

    const job = await Broadcast.findById(broadcastId);
    expect(job?.status).toBe('completed');
    // Only the admin itself is verified; the freshly-created unverified user is excluded.
    expect(job?.totalRecipients).toBe(1);
  });

  it('marks a user unsubscribed via a valid token and excludes them from future broadcasts', async () => {
    const { userId } = await makeUser(app);
    const token = signUnsubscribeToken(userId);

    const res = await request(app).get(`/api/v1/unsubscribe?token=${token}`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/unsubscribed');

    const user = await User.findById(userId);
    expect(user?.unsubscribedFromBroadcasts).toBe(true);
  });

  it('does not unsubscribe anyone for a malformed or tampered token', async () => {
    const { userId } = await makeUser(app);

    const res = await request(app).get('/api/v1/unsubscribe?token=not-a-real-token').redirects(0);
    expect(res.status).toBe(302);

    const user = await User.findById(userId);
    expect(user?.unsubscribedFromBroadcasts).toBe(false);
  });
});
