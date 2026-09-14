import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Application } from 'express';
import { makeInject } from './inject.js';
import { buildApp } from '../app.js';
import * as email from '../lib/email.js';
import { currentTotpCode } from '../lib/totp.js';

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
    expect(res.json().error.code).toBe('CONFLICT');
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

describe('password reset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Captures the link forgot-password would have emailed, without hitting Resend. */
  function spyOnResetLink() {
    return vi.spyOn(email, 'sendPasswordResetEmail').mockResolvedValue(undefined);
  }

  it('resets the password, logs the user in, and revokes older sessions', async () => {
    const reg = await registerUser('resetme@test.dev');
    const oldCookie = cookieHeader(reg);
    const sendSpy = spyOnResetLink();

    const forgot = await inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'resetme@test.dev' },
    });
    expect(forgot.statusCode).toBe(200);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const link = sendSpy.mock.calls[0]![1] as string;
    const token = new URL(link).searchParams.get('token');
    expect(token).toBeTruthy();

    const reset = await inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, password: 'brandnewpass1' },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().user.email).toBe('resetme@test.dev');
    // Reset logs the user straight back in with a fresh session.
    expect(reset.cookies.map((c) => c.name)).toEqual(
      expect.arrayContaining(['smsg_access', 'smsg_refresh']),
    );

    // The session that existed before the reset is dead now.
    const oldRefresh = await inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: oldCookie },
    });
    expect(oldRefresh.statusCode).toBe(401);

    // Old password no longer works; the new one does.
    const loginOld = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'resetme@test.dev', password: 'supersecret1' },
    });
    expect(loginOld.statusCode).toBe(401);
    const loginNew = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'resetme@test.dev', password: 'brandnewpass1' },
    });
    expect(loginNew.statusCode).toBe(200);
  });

  it('does not reveal whether an email is registered', async () => {
    const sendSpy = spyOnResetLink();
    const res = await inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'never-registered@test.dev' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects an unknown or malformed reset token', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'x'.repeat(32), password: 'whatever123' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('rejects reusing an already-consumed reset token', async () => {
    await registerUser('reuse@test.dev');
    const sendSpy = spyOnResetLink();
    await inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'reuse@test.dev' },
    });
    const link = sendSpy.mock.calls[0]![1] as string;
    const token = new URL(link).searchParams.get('token');

    const first = await inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, password: 'firstnewpass1' },
    });
    expect(first.statusCode).toBe(200);

    const second = await inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, password: 'secondnewpass1' },
    });
    expect(second.statusCode).toBe(400);
  });
});

describe('two-factor auth', () => {
  /** Registers a user and turns 2FA on for them, returning the secret,
   * session cookie, and unused recovery codes. */
  async function registerWithTwoFactor(email: string) {
    const reg = await registerUser(email);
    const cookie = cookieHeader(reg);

    const setup = await inject({ method: 'POST', url: '/api/v1/auth/2fa/setup', headers: { cookie } });
    expect(setup.statusCode).toBe(200);
    const secret = setup.json().secret as string;
    expect(setup.json().otpauthUrl).toContain('otpauth://totp/');

    const enable = await inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/enable',
      headers: { cookie },
      payload: { code: currentTotpCode(secret) },
    });
    expect(enable.statusCode).toBe(200);
    const recoveryCodes = enable.json().recoveryCodes as string[];
    expect(recoveryCodes).toHaveLength(10);

    return { cookie, secret, recoveryCodes };
  }

  it('setup requires a correct code to actually turn 2FA on', async () => {
    const reg = await registerUser('badcode@test.dev');
    const cookie = cookieHeader(reg);

    await inject({ method: 'POST', url: '/api/v1/auth/2fa/setup', headers: { cookie } });
    const wrong = await inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/enable',
      headers: { cookie },
      payload: { code: '000000' },
    });
    expect(wrong.statusCode).toBe(400);

    const me = await inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
    expect(me.json().user.twoFactorEnabled).toBe(false);
  });

  it('login holds off on a session until the code is verified', async () => {
    const { secret } = await registerWithTwoFactor('twofa@test.dev');

    const login = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'twofa@test.dev', password: 'supersecret1' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().twoFactorRequired).toBe(true);
    expect(login.cookies).toHaveLength(0);
    const pendingToken = login.json().pendingToken as string;

    const wrongCode = await inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { pendingToken, code: '000000' },
    });
    expect(wrongCode.statusCode).toBe(401);

    const verified = await inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { pendingToken, code: currentTotpCode(secret) },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.email).toBe('twofa@test.dev');
    expect(verified.cookies.map((c) => c.name)).toEqual(
      expect.arrayContaining(['smsg_access', 'smsg_refresh']),
    );
  });

  it('a recovery code logs in once and is then burned', async () => {
    const { recoveryCodes } = await registerWithTwoFactor('recovery@test.dev');
    const login = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'recovery@test.dev', password: 'supersecret1' },
    });
    const pendingToken = login.json().pendingToken as string;
    const code = recoveryCodes[0]!;

    const first = await inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { pendingToken, code },
    });
    expect(first.statusCode).toBe(200);

    // Same recovery code, a fresh login attempt — already spent.
    const login2 = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'recovery@test.dev', password: 'supersecret1' },
    });
    const second = await inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { pendingToken: login2.json().pendingToken, code },
    });
    expect(second.statusCode).toBe(401);
  });

  it('disabling requires the password and a valid code, then login skips 2FA', async () => {
    const { cookie, secret } = await registerWithTwoFactor('disable2fa@test.dev');

    const wrongPassword = await inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/disable',
      headers: { cookie },
      payload: { password: 'nope-not-it-12', code: currentTotpCode(secret) },
    });
    expect(wrongPassword.statusCode).toBe(401);

    const disable = await inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/disable',
      headers: { cookie },
      payload: { password: 'supersecret1', code: currentTotpCode(secret) },
    });
    expect(disable.statusCode).toBe(200);

    const login = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'disable2fa@test.dev', password: 'supersecret1' },
    });
    expect(login.json().twoFactorRequired).toBeUndefined();
    expect(login.json().user.email).toBe('disable2fa@test.dev');
  });
});
