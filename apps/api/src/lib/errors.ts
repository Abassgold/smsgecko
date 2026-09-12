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
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'Not allowed') => new AppError(403, 'forbidden', message);

export const emailNotVerified = (message = 'Verify your email address to continue') =>
  new AppError(403, 'email_not_verified', message);

export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable', message, details);

export const paymentRequired = (message = 'Insufficient balance') =>
  new AppError(402, 'insufficient_balance', message);

export const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, 'rate_limited', message);

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
      body: { code: 'validation_error', message: 'Request validation failed', details: e.issues },
    };
  }

  if (error instanceof SyntaxError && e.type === 'entity.parse.failed') {
    return { status: 400, body: { code: 'invalid_json', message: 'Request body is not valid JSON' } };
  }

  const status = e.status ?? e.statusCode;

  if (status === 429) {
    return { status: 429, body: { code: 'rate_limited', message: 'Too many requests' } };
  }

  if (typeof status === 'number' && status >= 400 && status < 500) {
    return {
      status,
      body: {
        code: typeof e.code === 'string' ? e.code.toLowerCase() : 'bad_request',
        message: e.message ?? 'Bad request',
      },
    };
  }

  return null;
}
