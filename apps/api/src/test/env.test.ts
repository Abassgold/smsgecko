import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv, resetEnvCache } from '../config/env.js';

/** Every email link, the logo and the unsubscribe header come from WEB_ORIGIN, so production must not start with a local or http one. */
const load = (over: Record<string, string>) => loadEnv({ ...process.env, ...over });
afterEach(() => resetEnvCache());

describe('WEB_ORIGIN in production', () => {
  it.each([
    ['the localhost default', 'http://localhost:3000'],
    ['plain http', 'http://smsgecko.com'],
    ['https on localhost', 'https://localhost:3000'],
    ['https on 127.0.0.1', 'https://127.0.0.1'],
    ['a path on the address', 'https://smsgecko.com/app'],
  ])('refuses to start with %s', (_what, origin) => {
    resetEnvCache();
    expect(() => load({ NODE_ENV: 'production', WEB_ORIGIN: origin })).toThrow(/WEB_ORIGIN must be the public https address/);
  });

  it('starts with a public https address, with or without a trailing slash', () => {
    resetEnvCache();
    expect(load({ NODE_ENV: 'production', WEB_ORIGIN: 'https://smsgecko.com' }).WEB_ORIGIN).toBe('https://smsgecko.com');
    resetEnvCache();
    expect(load({ NODE_ENV: 'production', WEB_ORIGIN: 'https://smsgecko.com/' }).WEB_ORIGIN).toBe('https://smsgecko.com/');
  });

  it('does not get in the way of development or tests', () => {
    resetEnvCache();
    expect(() => load({ NODE_ENV: 'development', WEB_ORIGIN: 'http://localhost:3000' })).not.toThrow();
    resetEnvCache();
    expect(() => load({ NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:3000' })).not.toThrow();
  });
});
