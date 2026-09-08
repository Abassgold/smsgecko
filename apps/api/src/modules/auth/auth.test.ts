import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { makeInject } from '../../test/inject.js';
import { buildApp } from '../../app.js';

let app: Application;
let inject: ReturnType<typeof makeInject>;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  inject = makeInject(app);
});

afterAll(async () => {
  // express app needs no teardown
});

/** Turn an inject response's set-cookie headers into a Cookie request header. */
function cookieHeader(res: { cookies: Array<{ name: string; value: string }> }): string {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function registerUser(email = `u${Date.now()}${Math.random()}@test.dev`) {
  const res = await inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'supersecret1' },
  });
  return res;
}

describe('auth', () => {
  it('registers a user, returns public shape, sets auth cookies', async () => {
    const res = await registerUser('alice@test.dev');
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe('alice@test.dev');
    expect(body.user.username).toBeTruthy();
    expect(body.user.balanceMicro).toBe(0);
    expect(body.user.affiliateCode).toMatch(/^[A-Z0-9]{12,}$/);
    expect(body.user.passwordHash).toBeUndefined();

    const names = res.cookies.map((c) => c.name);
    expect(names).toContain('smsg_access');
    expect(names).toContain('smsg_refresh');
  });

  it('rejects duplicate email with 409', async () => {
    await registerUser('dupe@test.dev');
    const res = await registerUser('dupe@test.dev');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('conflict');
  });

  it('rejects weak password with 400', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'weak@test.dev', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const reg = await inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bob@test.dev', username: 'bobby', password: 'supersecret1' },
    });
    const username = reg.json().user.username as string;

    const bad = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'bob@test.dev', password: 'wrongpass1' },
    });
    expect(bad.statusCode).toBe(401);

    const ok = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'bob@test.dev', password: 'supersecret1' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.cookies.map((c) => c.name)).toEqual(expect.arrayContaining(['smsg_access', 'smsg_refresh']));

    // ...and with the username instead of the email.
    const byName = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: username, password: 'supersecret1' },
    });
    expect(byName.statusCode).toBe(200);
    expect(byName.cookies.map((c) => c.name)).toEqual(
      expect.arrayContaining(['smsg_access', 'smsg_refresh']),
    );
  });

  it('guards /me and returns the user when authenticated', async () => {
    const anon = await inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(anon.statusCode).toBe(401);

    const reg = await registerUser('carol@test.dev');
    const me = await inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: cookieHeader(reg) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('carol@test.dev');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const reg = await registerUser('dave@test.dev');
    const firstRefreshCookie = cookieHeader(reg);

    const rot1 = await inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: firstRefreshCookie },
    });
    expect(rot1.statusCode).toBe(200);
    const rotatedCookie = cookieHeader(rot1);
    expect(rotatedCookie).not.toEqual(firstRefreshCookie);

    // New token works.
    const rot2 = await inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: rotatedCookie },
    });
    expect(rot2.statusCode).toBe(200);

    // Reusing the original (already rotated) token is rejected.
    const reuse = await inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: firstRefreshCookie },
    });
    expect(reuse.statusCode).toBe(401);

    // ...and the reuse nukes the family, so the latest token is dead too.
    const afterNuke = await inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: cookieHeader(rot2) },
    });
    expect(afterNuke.statusCode).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const reg = await registerUser('erin@test.dev');
    const cookie = cookieHeader(reg);

    const out = await inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);

    const refresh = await inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie },
    });
    expect(refresh.statusCode).toBe(401);
  });
});
