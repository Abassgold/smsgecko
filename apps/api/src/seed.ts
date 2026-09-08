
import { randomInt } from 'node:crypto';
import type { AnyBulkWriteOperation } from 'mongoose';
import { connectMongo, disconnectMongo, mongoose } from './db/mongoose.js';
import { User } from './models/User.js';
import { Service } from './models/Service.js';
import { Country } from './models/Country.js';
import { Offer } from './models/Offer.js';
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
import { SERVICES, COUNTRIES } from './seed/data.js';

function placeholderPrice(popular: boolean): number {
  const ceiling = popular ? 0.9 : 1.8;
  const usd = 0.004 + Math.pow(Math.random(), 3) * ceiling;
  return Math.max(4000, Math.round(usd * 1_000_000));
}

const OWNED_MODELS = [
  User, Service, Country, Offer, Order, Transaction, SmsMessage, Deposit, RefreshToken,
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

  await ProviderConfig.updateOne(
    { label: 'Mock SIM bank' },
    { $setOnInsert: { key: 'mock', label: 'Mock SIM bank', enabled: true, priority: 0 } },
    { upsert: true },
  );
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

  await Service.bulkWrite(
    SERVICES.map((s, i) => ({
      updateOne: {
        filter: { slug: s.slug },
        update: {
          $set: {
            name: s.name,
            iconKey: s.iconKey,
            aliases: s.aliases ?? [],
            popular: Boolean(s.popular),
          },
          $setOnInsert: { slug: s.slug, sortOrder: i },
        },
        upsert: true,
      },
    })) as AnyBulkWriteOperation[],
  );
  await Country.bulkWrite(
    COUNTRIES.map((c, i) => ({
      updateOne: {
        filter: { code: c.code },
        update: {
          $set: { name: c.name, dialCode: c.dialCode, flagEmoji: c.flagEmoji },
          $setOnInsert: { code: c.code, sortOrder: i },
        },
        upsert: true,
      },
    })) as AnyBulkWriteOperation[],
  );

  const services = await Service.find();
  const countries = await Country.find();
  console.log(`  ${services.length} services, ${countries.length} countries`);

  const CORE = new Set(['id', 'in', 'us', 'gb', 'ph', 'br', 'ng', 'my', 'th', 'vn']);
  const ops: AnyBulkWriteOperation[] = [];
  for (const service of services) {
    const chosen = new Set<string>();
    if (service.popular) {
      for (const c of countries) chosen.add(String(c._id));
    } else {
      for (const c of countries) if (CORE.has(c.code)) chosen.add(String(c._id));
      for (const c of [...countries].sort(() => Math.random() - 0.5).slice(0, randomInt(8, 16))) {
        chosen.add(String(c._id));
      }
    }
    for (const country of countries) {
      if (!chosen.has(String(country._id))) continue;
      ops.push({
        updateOne: {
          filter: { serviceId: service._id, countryId: country._id, operator: null },
          update: {
            $setOnInsert: {
              serviceId: service._id,
              countryId: country._id,
              operator: null,
              priceMicro: placeholderPrice(service.popular),
              stock: service.popular ? randomInt(40, 800) : randomInt(3, 500),
              active: true,
            },
          },
          upsert: true,
        },
      });
    }
  }
  const res = await Offer.bulkWrite(ops);
  console.log(`  ${await Offer.countDocuments()} offers (${res.upsertedCount} new)`);

  const admins = await User.countDocuments({ role: 'admin' });
  console.log(`  providers: mock (enabled), Reseller A (disabled)`);
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
