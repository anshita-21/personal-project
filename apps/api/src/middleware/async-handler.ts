import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 5 already forwards a rejected promise returned by a handler to the
 * error middleware. This wrapper exists for one narrow reason: it makes the
 * handler's return type `void` so handlers can be written as
 * `async (req, res) => { res.json(...) }` and still satisfy RequestHandler
 * without each call site repeating a `void` cast.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
