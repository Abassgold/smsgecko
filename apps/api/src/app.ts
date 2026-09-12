import express, { type Application, type ErrorRequestHandler, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { classifyError } from './lib/errors.js';
import { attachUser } from './middleware/auth.js';
import authRoutes from './routes/auth.routes.js';
import apiKeyRoutes from './routes/apikeys.routes.js';
import v2Routes from './routes/v2.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import orderRoutes from './routes/orders.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import depositRoutes from './routes/deposits.routes.js';
import webhookRoutes from './routes/webhooks.routes.js';
import affiliateRoutes from './routes/affiliate.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import adminRoutes from './routes/admin/index.js';

export interface BuildAppOptions {
  /** Disable HTTP request logging (used by tests). */
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<Application> {
  const app = express();

  app.set('trust proxy', true);
  app.set('query parser', 'simple');
  app.disable('x-powered-by');

  if (opts.logger !== false) {
    app.use(pinoHttp({ logger }));
  }

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 60_000,
      // Effectively off under test so the suite can register many accounts.
      max: env.NODE_ENV === 'test' ? 100_000 : 300,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/health',
      // express-rate-limit's own default handler sends plain text and never
      // reaches errorHandler/classifyError below — match their JSON shape here
      // by hand so 429 isn't the one response in the whole API that isn't JSON.
      handler: (req, res) => {
        const body = { code: 'RATE_LIMITED', message: 'Too many requests' };
        res.status(429).json(req.path.startsWith('/api/v2') ? { success: false, error: body } : { error: body });
      },
    }),
  );
  app.use(attachUser);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'smsgecko-api', ts: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRoutes);
  // Before depositRoutes — that router has an unpathed requireVerified that would
  // otherwise 401 any /api/v1/* path falling through it.
  app.use('/api/v1/webhooks', webhookRoutes);
  app.use('/api/v1/catalog', catalogRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1', walletRoutes);
  app.use('/api/v1', depositRoutes);
  app.use('/api/v1/affiliate', affiliateRoutes);
  app.use('/api/v1/api-keys', apiKeyRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v2', v2Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
};

const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const classified = classifyError(error);
  if (classified) return res.status(classified.status).json({ error: classified.body });

  (req.log ?? logger).error({ err: error }, 'unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};
