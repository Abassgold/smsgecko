import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wrap an async controller so a rejected promise is forwarded to Express'
 * error handler. Express 5 already does this for async handlers, but wrapping
 * keeps the intent explicit and uniform across every controller.
 */
export const asyncHandler =
  (fn: AsyncRouteHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export default asyncHandler;
