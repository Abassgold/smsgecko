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
import { encryptJson } from './lib/secretbox.js';
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

  // The storefront catalog is live from the highest-priority enabled provider.
  // Nothing is enabled out of the box — configure a real reseller in the admin
  // panel (Providers) to bring the catalog online.
  await ProviderConfig.updateOne(
    { label: 'Reseller A (unconfigured)' },
    {
      $setOnInsert: {
        key: 'custom_http',
        label: 'Reseller A (unconfigured)',
        enabled: false,
        priority: 1,
        configEnc: encryptJson({
          baseUrl: '',
          apiKey: '',
          authMode: 'query',
          parseMode: 'text',
          rentPath: '/handler_api.php?action=getNumber&service={service}&country={country}',
          statusPath: '/handler_api.php?action=getStatus&id={ref}',
          cancelPath: '/handler_api.php?action=setStatus&id={ref}&status=8',
          healthPath: '/handler_api.php?action=getBalance',
          map: {
            textRentRegex: 'ACCESS_NUMBER:(\\d+):(\\d+)',
            textReceivedRegex: 'STATUS_OK:(.+)',
            textCanceledValues: ['STATUS_CANCEL'],
          },
        }),
      },
    },
    { upsert: true },
  );

  const admins = await User.countDocuments({ role: 'admin' });
  console.log(`  providers: Reseller A (disabled) — enable a real one in the admin panel`);
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
