import jwt from 'jsonwebtoken';
import type { Role } from '@examprep/shared';
import { env } from '../../config/env';

export const AUTH_COOKIE = 'examprep_session';

export interface SessionTokenPayload {
  /** User id. */
  sub: string;
  role: Role;
  /** Session row id. Lets the server revoke a token before it expires. */
  jti: string;
}

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/** Returns null for anything we would not accept: bad signature, expiry, shape. */
export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.jti !== 'string' ||
      (decoded.role !== 'STUDENT' && decoded.role !== 'ADMIN')
    ) {
      return null;
    }
    return { sub: decoded.sub, role: decoded.role, jti: decoded.jti };
  } catch {
    return null;
  }
}

/**
 * Cookie options for the session cookie.
 *   httpOnly - JavaScript (and therefore an XSS payload) cannot read it.
 *   sameSite lax - the browser will not attach it to a cross-site POST, which
 *                  closes the main CSRF vector. `verifyRequestOrigin` is the
 *                  defence-in-depth layer behind it.
 *   secure   - on behind HTTPS (COOKIE_SECURE=true in production).
 */
export function sessionCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: maxAgeMs,
  };
}
