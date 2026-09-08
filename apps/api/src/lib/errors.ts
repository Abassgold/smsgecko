/**
 * Application errors carry an HTTP status and a stable machine-readable code.
 * The Express error handler in app.ts turns these into the shared
 * `errorResponse` shape: { error: { code, message, details? } }.
 */
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
