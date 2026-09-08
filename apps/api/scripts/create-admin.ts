/**
 * Create (or promote) an admin user. Credentials come from the environment:
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a strong password' npm run create-admin
 *
 * - If the email already exists it is promoted to admin (and the password is
 *   reset when ADMIN_PASSWORD is given).
 * - Otherwise a new admin user is created.
 */
import { connectMongo, disconnectMongo } from '../src/db/mongoose.js';
import { User } from '../src/models/User.js';
import { hashPassword, friendlyCode } from '../src/lib/crypto.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

async function uniqueUsername(seed: string): Promise<string> {
  const base = (seed.replace(/[^a-z0-9_.-]/gi, '').slice(0, 24) || 'admin').toLowerCase();
  let candidate = base;
  for (let i = 0; i < 25; i++) {
    if (!(await User.exists({ username: candidate }))) return candidate;
    candidate = `${base}${Math.floor(Math.random() * 9000) + 1000}`;
  }
  return `${base}${friendlyCode(4).toLowerCase()}`;
}

async function uniqueAffiliateCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = friendlyCode(12);
    if (!(await User.exists({ affiliateCode: code }))) return code;
  }
  return friendlyCode(16);
}

async function main() {
  if (!email) throw new Error('ADMIN_EMAIL is required');

  await connectMongo();

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = 'admin';
    existing.status = 'active';
    if (password) {
      if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
      existing.passwordHash = await hashPassword(password);
    }
    await existing.save();
    console.log(`Promoted existing user to admin: ${email}${password ? ' (password reset)' : ''}`);
  } else {
    if (!password || password.length < 8) {
      throw new Error('ADMIN_PASSWORD (8+ chars) is required to create a new admin');
    }
    await User.create({
      email,
      username: await uniqueUsername(email.split('@')[0] ?? 'admin'),
      role: 'admin',
      status: 'active',
      passwordHash: await hashPassword(password),
      balanceMicro: 0,
      affiliateCode: await uniqueAffiliateCode(),
    });
    console.log(`Created admin user: ${email}`);
  }

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(`create-admin failed: ${err instanceof Error ? err.message : err}`);
  await disconnectMongo();
  process.exit(1);
});
