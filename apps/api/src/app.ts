import express, { type Application, type ErrorRequestHandler, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { attachUser } from './middleware/auth.js';
import authRoutes from './routes/auth.routes.js';
import apiKeyRoutes from './routes/apikeys.routes.js';
import v2Routes from './routes/v2.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import orderRoutes from './routes/orders.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import depositRoutes from './routes/deposits.routes.js';
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
    }),
  );
  app.use(attachUser);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'smsgecko-api', ts: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRoutes);
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
    error: { code: 'not_found', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
};

const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const e = error as {
    message?: string;
    name?: string;
    code?: string;
    type?: string;
    status?: number;
    statusCode?: number;
    issues?: unknown;
  };

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  if (error instanceof ZodError || e.name === 'ZodError') {
    return res.status(400).json({
      error: { code: 'validation_error', message: 'Request validation failed', details: e.issues },
    });
  }

  // Body parser: malformed JSON payload.
  if (error instanceof SyntaxError && e.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'invalid_json', message: 'Request body is not valid JSON' },
    });
  }

  const status = e.status ?? e.statusCode;

  if (status === 429) {
    return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests' } });
  }

  // Honor other library 4xx errors (payload too large, bad content-type, …).
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return res.status(status).json({
      error: {
        code: typeof e.code === 'string' ? e.code.toLowerCase() : 'bad_request',
        message: e.message ?? 'Bad request',
      },
    });
  }

  (req.log ?? logger).error({ err: error }, 'unhandled error');
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong' },
  });
};
