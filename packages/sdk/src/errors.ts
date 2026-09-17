/**
 * Every /api/v2 error response is `{ success: false, error: { code,
 * message, details? } }` (see apps/api/src/lib/errors.ts#classifyError in
 * the SMSGecko repo). This wraps that shape so callers can `catch` one
 * error type instead of checking `response.ok` themselves.
 */
export class SMSGeckoError extends Error {
  /** HTTP status code of the response. */
  readonly status: number;
  /** Machine-readable error code, e.g. "UNAUTHORIZED", "VALIDATION_ERROR". */
  readonly code: string;
  /** Present on validation errors — the underlying yup issue list. */
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'SMSGeckoError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Thrown by waitForOtp() when timeoutMs elapses while the order is still `waiting`. */
export class SMSGeckoTimeoutError extends Error {
  readonly orderId: string;

  constructor(orderId: string, timeoutMs: number) {
    super(`No OTP received for order ${orderId} within ${timeoutMs}ms`);
    this.name = 'SMSGeckoTimeoutError';
    this.orderId = orderId;
  }
}

/** Thrown by waitForOtp() when the order leaves `waiting` some other way
 * (canceled or expired) before an OTP arrived — distinct from a timeout,
 * since waiting longer wouldn't have helped. */
export class SMSGeckoOrderFailedError extends Error {
  readonly orderId: string;
  readonly status: 'canceled' | 'expired';

  constructor(orderId: string, status: 'canceled' | 'expired') {
    super(`Order ${orderId} ${status} before an OTP arrived`);
    this.name = 'SMSGeckoOrderFailedError';
    this.orderId = orderId;
    this.status = status;
  }
}
