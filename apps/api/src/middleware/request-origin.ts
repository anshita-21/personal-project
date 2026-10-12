import type { RequestHandler } from 'express';
import { isAllowedOrigin } from '../config/env';
import { forbidden } from '../errors/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth.
 *
 * The primary defence is the session cookie's `SameSite=Lax` attribute: the
 * browser does not attach it to a cross-site state-changing request, so a
 * malicious page cannot act as the user. This middleware adds a second check -
 * if a state-changing request DOES carry a browser-set `Origin` (or `Referer`),
 * that origin must be allow-listed.
 *
 * A request with no Origin/Referer at all is allowed through: non-browser
 * clients (curl, a mobile app, the integration test suite) legitimately omit
 * it, and a browser cannot be made to omit it on a cross-site request. This is
 * the documented limit of the double-check - see docs/architecture.md.
 */
export const verifyRequestOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin') ?? originOf(req.get('referer'));
  if (!origin) {
    next();
    return;
  }

  if (!isAllowedOrigin(origin)) {
    // Naming the rejected origin makes a misconfiguration diagnosable; the
    // caller already knows its own origin, so nothing is disclosed.
    next(forbidden(`Cross-origin request blocked: ${origin} is not an allowed origin.`));
    return;
  }

  next();
};

function originOf(referer: string | undefined): string | null {
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
