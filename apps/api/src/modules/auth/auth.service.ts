import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  UserView,
} from '@examprep/shared';
import type { User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { conflict, notFound, unauthenticated, validationError } from '../../errors/app-error';
import { hashPassword, verifyPassword } from './password';
import { signSessionToken } from './token';
import { parseDurationMs } from './duration';

export interface IssuedSession {
  user: UserView;
  token: string;
  /** Cookie lifetime in ms, kept identical to the JWT lifetime. */
  maxAgeMs: number;
}

export function toUserView(user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt'>): UserView {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * A pre-computed hash of a throwaway password.
 *
 * Used to equalise the cost of "unknown email" and "wrong password": without
 * it, a failed login for a non-existent account returns measurably faster than
 * one for a real account, which turns the login endpoint into an account
 * enumeration oracle.
 */
const DUMMY_HASH_PROMISE = hashPassword('timing-equalisation-only-not-a-real-password-1');

async function issueSession(
  user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt'>,
  userAgent: string | undefined,
): Promise<IssuedSession> {
  const maxAgeMs = parseDurationMs(env.JWT_EXPIRES_IN);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + maxAgeMs),
      userAgent: userAgent?.slice(0, 255) ?? null,
    },
    select: { id: true },
  });

  const token = signSessionToken({ sub: user.id, role: user.role, jti: session.id });
  return { user: toUserView(user), token, maxAgeMs };
}

export async function register(
  input: RegisterInput,
  userAgent?: string,
): Promise<IssuedSession> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    // Registration cannot avoid disclosing that an email is taken without
    // sending a confirmation email, which this project deliberately does not
    // do (no external services). Login, which is the attacker-interesting
    // endpoint, does not disclose it.
    throw conflict('An account with that email already exists.');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash, role: 'STUDENT' },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return issueSession(user, userAgent);
}

export async function login(input: LoginInput, userAgent?: string): Promise<IssuedSession> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true, role: true, createdAt: true, passwordHash: true },
  });

  if (!user) {
    await verifyPassword(input.password, await DUMMY_HASH_PROMISE);
    throw unauthenticated('Invalid email or password.');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw unauthenticated('Invalid email or password.');
  }

  return issueSession(user, userAgent);
}

/** Revokes exactly the session the caller is using. */
export async function logout(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutEverywhere(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getProfile(userId: string): Promise<UserView> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  if (!user) {
    throw notFound('Account not found.');
  }
  return toUserView(user);
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<UserView> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: input.name },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return toUserView(user);
}

/**
 * Changing a password revokes every OTHER session of the account: if the
 * password was changed because it leaked, leaving the thief's cookie valid
 * defeats the point. The caller's own session is kept so they are not signed
 * out of the tab they are using.
 */
export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    throw notFound('Account not found.');
  }

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw validationError('Current password is incorrect.', [
      { path: 'currentPassword', message: 'Current password is incorrect.' },
    ]);
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    }),
  ]);
}
