import { ZodError } from 'zod';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Not allowed') => new AppError(403, 'FORBIDDEN', message);

export const emailNotVerified = (message = 'Verify your email address to continue') =>
  new AppError(403, 'EMAIL_NOT_VERIFIED', message);

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'UNPROCESSABLE', message, details);

export const paymentRequired = (message = 'Insufficient balance') =>
  new AppError(402, 'INSUFFICIENT_BALANCE', message);

export const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', message);

export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Turn a thrown value into an HTTP status + error body, for the known/expected
 * error shapes (AppError, Zod, malformed JSON, upstream 4xx). Returns `null`
 * for anything else — callers treat that as an unhandled 500 and log it.
 */
export function classifyError(error: unknown): { status: number; body: ErrorBody } | null {
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
    return { status: error.statusCode, body: { code: error.code, message: error.message, details: error.details } };
  }

  if (error instanceof ZodError || e.name === 'ZodError') {
    return {
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: e.issues },
    };
  }

  if (error instanceof SyntaxError && e.type === 'entity.parse.failed') {
    return { status: 400, body: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } };
  }

  const status = e.status ?? e.statusCode;

  if (status === 429) {
    return { status: 429, body: { code: 'RATE_LIMITED', message: 'Too many requests' } };
  }

  if (typeof status === 'number' && status >= 400 && status < 500) {
    return {
      status,
      body: {
        code: typeof e.code === 'string' ? e.code.toUpperCase() : 'BAD_REQUEST',
        message: e.message ?? 'Bad request',
      },
    };
  }

  return null;
}
