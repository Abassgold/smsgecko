import { connectMongo, disconnectMongo, mongoose } from './db/mongoose.js';
import { User } from './models/User.js';
import { Order } from './models/Order.js';
import { Transaction } from './models/Transaction.js';
import { SmsMessage } from './models/SmsMessage.js';
import { Deposit } from './models/Deposit.js';
import { RefreshToken } from './models/RefreshToken.js';
import { ApiKey } from './models/ApiKey.js';
import { Notification } from './models/Notification.js';
import { ProviderConfig } from './models/ProviderConfig.js';
import { Setting } from './models/Setting.js';
import { ensureSettings } from './lib/settings.js';

const OWNED_MODELS = [
  User, Order, Transaction, SmsMessage, Deposit, RefreshToken,
  ApiKey, Notification, ProviderConfig, Setting,
];

async function main() {
  await connectMongo();
  console.log(`Bootstrapping ${mongoose.connection.name} …`);

  if (process.env.SEED_FRESH === '1') {
    console.log('  SEED_FRESH=1 — dropping owned collections');
    for (const m of OWNED_MODELS) {
      await m.collection.drop().catch((err: { codeName?: string }) => {
        if (err?.codeName !== 'NamespaceNotFound') throw err;
      });
    }
  }

  await Promise.all(OWNED_MODELS.map((m) => m.syncIndexes()));
  await ensureSettings();

  // No providers are seeded — configure and enable a real reseller in the admin
  // panel (Providers) to bring the storefront catalog online.

  const admins = await User.countDocuments({ role: 'admin' });
  console.log(
    admins > 0
      ? `  admins: ${admins} existing`
      : `  no admin user yet — run:  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run create-admin`,
  );
  console.log('Done.');

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error('Bootstrap failed:', err);
  await disconnectMongo();
  process.exit(1);
});
