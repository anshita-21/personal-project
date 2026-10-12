import type { Request } from 'express';
import type { ZodType } from 'zod';

/**
 * Validation helpers.
 *
 * These parse at the controller boundary and RETURN the typed value rather than
 * mutating the request, which keeps the inferred Zod type flowing into the
 * service call. A thrown ZodError is translated to a 400 VALIDATION_ERROR by
 * the central error handler, so no handler needs a try/catch.
 *
 * Nothing downstream ever reads `req.body` / `req.query` directly - the parsed
 * value is the only input a service sees. That is what stops unvalidated,
 * attacker-controlled extra fields from reaching Prisma.
 */
export function parseBody<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(req.body);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(req.query);
}

export function parseParams<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(req.params);
}
