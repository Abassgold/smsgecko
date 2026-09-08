import type { Application } from 'express';
import { makeInject } from './inject.js';
import { Order, type OrderDoc } from '../models/Order.js';
import { ProviderConfig } from '../models/ProviderConfig.js';
import { User } from '../models/User.js';
import { encryptJson } from '../lib/secretbox.js';
import { pollOrderOnce } from '../workers/index.js';
import { bustProviderCache } from '../providers/sms/registry.js';

let seq = 0;

/**
 * Point the seeded `mock` provider's live catalog at one known service×country
 * with a fixed price/stock. Returns `{ service:{id}, country:{id}, serviceCode,
 * countryCode }` — `id`s are the codes you POST to `/api/v1/orders`.
 */
export async function makeCatalog(
  opts: { priceMicro?: number; stock?: number; serviceCode?: string; countryCode?: string } = {},
) {
  seq += 1;
  const serviceCode = opts.serviceCode ?? `svc${seq}`;
  const countryCode = opts.countryCode ?? `c${seq}`;
  await ProviderConfig.updateOne(
    { key: 'mock' },
    {
      $set: {
        enabled: true,
        priority: 0,
        configEnc: encryptJson({
          catalogPriceMicro: opts.priceMicro ?? 100_000,
          catalogStock: opts.stock ?? 10,
          catalogServices: [{ code: serviceCode, name: serviceCode }],
          catalogCountries: [{ code: countryCode, name: countryCode, iso2: 'us', dialCode: '1' }],
        }),
      },
    },
    { upsert: true },
  );
  bustProviderCache();
  return { service: { id: serviceCode }, country: { id: countryCode }, serviceCode, countryCode };
}

/** Register a user through the API and return an auth cookie header + the user id. */
export async function makeUser(
  app: Application,
  opts: { balanceMicro?: number } = {},
): Promise<{ cookie: string; userId: string; email: string }> {
  seq += 1;
  const email = `user${seq}.${Date.now()}@test.dev`;
  const res = await makeInject(app)({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'supersecret1' },
  });
  const userId = res.json().user.id as string;
  // Registrations land unverified now (`User.isVerified` defaults false); mark
  // the account verified so it can exercise `requireVerified` routes. Tests that
  // care about the verification flow drive it through the API explicitly.
  await User.updateOne(
    { _id: userId },
    { $set: { isVerified: true, ...(opts.balanceMicro ? { balanceMicro: opts.balanceMicro } : {}) } },
  );
  const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return { cookie, userId, email };
}

/** Register a user and promote them to admin; returns their auth cookie. */
export async function makeAdmin(app: Application): Promise<{ cookie: string; userId: string }> {
  const { cookie, userId } = await makeUser(app);
  await User.updateOne({ _id: userId }, { $set: { role: 'admin' } });
  return { cookie, userId };
}

/** Add a provider config to the fallback chain. */
export async function makeProvider(opts: {
  key?: 'mock' | 'custom_http';
  label?: string;
  enabled?: boolean;
  priority?: number;
  config?: Record<string, unknown>;
}) {
  seq += 1;
  const cfg = await ProviderConfig.create({
    key: opts.key ?? 'custom_http',
    label: opts.label ?? `Provider ${seq}`,
    enabled: opts.enabled ?? true,
    priority: opts.priority ?? 50,
    configEnc: opts.config ? encryptJson(opts.config) : null,
  });
  bustProviderCache();
  return cfg;
}

/** Fast-forward a mock order so the polling worker delivers its OTP now. */
export async function simulateOtp(orderId: string): Promise<OrderDoc | null> {
  await Order.updateOne({ _id: orderId }, { $set: { deliverAt: new Date(0) } });
  const order = await Order.findById(orderId);
  if (!order) return null;
  const { order: updated } = await pollOrderOnce(order);
  return updated;
}
