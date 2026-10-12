import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@examprep/shared';
import { prisma } from '../db/prisma';
import { forbidden, unauthenticated } from '../errors/app-error';
import { AUTH_COOKIE, verifySessionToken } from '../modules/auth/token';

/**
 * Resolves the caller from the session cookie.
 *
 * Two deliberate decisions:
 *
 * 1. The signature check alone is not enough. The session row is loaded on
 *    every authenticated request so that logout, "revoke all sessions" and
 *    account deletion take effect immediately instead of after the JWT's
 *    lifetime. The cost is one indexed primary-key lookup per request.
 *
 * 2. The role comes from the USER ROW, not from the token claim. If an admin is
 *    demoted, their existing cookie must not keep admin powers until it expires.
 */
async function resolvePrincipal(req: Request): Promise<Request['auth'] | null> {
  const raw: unknown = req.cookies?.[AUTH_COOKIE];
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }

  const payload = verifySessionToken(raw);
  if (!payload) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.jti },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { id: true, role: true } },
    },
  });

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= Date.now() ||
    session.userId !== payload.sub
  ) {
    return null;
  }

  return { userId: session.user.id, role: session.user.role, sessionId: session.id };
}

/** Rejects the request unless a valid session is present. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const principal = await resolvePrincipal(req);
    if (!principal) {
      next(unauthenticated());
      return;
    }
    req.auth = principal;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Attaches the principal when one is present but never rejects.
 * Used by the public catalogue, which enriches rows for signed-in students.
 */
export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  try {
    const principal = await resolvePrincipal(req);
    if (principal) {
      req.auth = principal;
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role gate. Always used in addition to `authenticate`, never instead of it.
 * Frontend route guards are UX only; this is the actual authorization boundary.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(unauthenticated());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(forbidden('This action requires a different role.'));
      return;
    }
    next();
  };
}

export const requireAdmin: RequestHandler[] = [authenticate, requireRole('ADMIN')];
