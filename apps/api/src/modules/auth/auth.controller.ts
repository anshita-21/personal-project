import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
  type AuthResponse,
} from '@examprep/shared';
import { parseBody } from '../../middleware/validate';
import { unauthenticated } from '../../errors/app-error';
import { AUTH_COOKIE, sessionCookieOptions } from './token';
import * as authService from './auth.service';
import type { IssuedSession } from './auth.service';

/**
 * Controllers do three things only: parse input, call a service, shape the
 * response. No business rules live here - that is what keeps the rules testable
 * without an HTTP server and reusable from the GraphQL resolvers.
 */

function sendSession(res: Response, issued: IssuedSession, status: number): void {
  res.cookie(AUTH_COOKIE, issued.token, sessionCookieOptions(issued.maxAgeMs));
  const body: AuthResponse = { user: issued.user };
  res.status(status).json(body);
}

function requireAuth(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) {
    // Unreachable when the route is wired with `authenticate`; this keeps the
    // controller honest under strict null checks instead of using `!`.
    throw unauthenticated();
  }
  return req.auth;
}

export async function register(req: Request, res: Response): Promise<void> {
  const input = parseBody(req, registerSchema);
  const issued = await authService.register(input, req.get('user-agent'));
  sendSession(res, issued, 201);
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = parseBody(req, loginSchema);
  const issued = await authService.login(input, req.get('user-agent'));
  sendSession(res, issued, 200);
}

export async function logout(req: Request, res: Response): Promise<void> {
  if (req.auth) {
    await authService.logout(req.auth.sessionId);
  }
  res.clearCookie(AUTH_COOKIE, { ...sessionCookieOptions(0), maxAge: undefined });
  res.status(204).send();
}

export async function logoutEverywhere(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  await authService.logoutEverywhere(auth.userId);
  res.clearCookie(AUTH_COOKIE, { ...sessionCookieOptions(0), maxAge: undefined });
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const body: AuthResponse = { user: await authService.getProfile(auth.userId) };
  res.json(body);
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const input = parseBody(req, updateProfileSchema);
  const body: AuthResponse = { user: await authService.updateProfile(auth.userId, input) };
  res.json(body);
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const input = parseBody(req, changePasswordSchema);
  await authService.changePassword(auth.userId, auth.sessionId, input);
  res.status(204).send();
}
