import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectMongo, disconnectMongo } from './db/mongoose.js';
import { logger } from './lib/logger.js';
import { ensureProviders } from './lib/ensureProviders.js';
import { ensureSettings } from './lib/settings.js';
import { Order } from './models/Order.js';
import { startWorkers, stopWorkers } from './workers/index.js';

async function main() {
  await connectMongo();
  await ensureSettings();
  await ensureProviders();
  // autoIndex is off in production, so ensure the order publicId index exists.
  // Idempotent, and creates ONLY this index (never drops others the way
  // syncIndexes would). The partial filter skips the null publicId on older
  // orders, so it's safe to build over an existing collection.
  await Order.collection
    .createIndex(
      { publicId: 1 },
      { unique: true, partialFilterExpression: { publicId: { $type: 'string' } } },
    )
    .catch((err) => logger.warn({ err }, 'order publicId index ensure failed'));
  const app = await buildApp();

  if (env.WORKERS_ENABLED) startWorkers(logger);

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`Server listening at http://${env.HOST}:${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopWorkers();
    server.close(() => {
      disconnectMongo()
        .then(() => process.exit(0))
        .catch((err) => {
          logger.error({ err }, 'error during shutdown');
          process.exit(1);
        });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // A background query rejecting during a transient DB drop must not take the
  // whole API down — log and stay up (the mongo driver reconnects on its own).
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandledRejection — kept alive');
  });
  // A genuinely uncaught *synchronous* exception leaves the process in an
  // unknown state, so this restarts cleanly (Render brings it back). The mongo
  // connection listeners in db/mongoose.ts mean transient DB errors no longer
  // reach here, so this only fires on a real bug.
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException — exiting for a clean restart');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
