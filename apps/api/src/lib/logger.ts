import { pino, type Logger } from 'pino';
import { env } from '../config/env.js';

/**
 * The one process-wide logger. Used by `pino-http` in app.ts, the background
 * workers, and the server bootstrap.
 */
export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});

export type { Logger };
