import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectMongo, disconnectMongo } from './db/mongoose.js';
import { logger } from './lib/logger.js';
import { ensureSettings } from './lib/settings.js';
import { startWorkers, stopWorkers } from './workers/index.js';

async function main() {
  await connectMongo();
  await ensureSettings();
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
}

main().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
