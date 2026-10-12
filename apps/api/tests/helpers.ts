import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { createAdmin, createStudent, type TestUser } from '../src/testing/fixtures';

export const app: Express = createApp();

export type Agent = ReturnType<typeof request.agent>;

/**
 * A Supertest agent keeps the Set-Cookie from login, so the rest of the test
 * exercises exactly the cookie-based auth a browser would use - no bearer-token
 * shortcut that bypasses the real code path.
 */
export async function signIn(user: TestUser): Promise<Agent> {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password });
  if (response.status !== 200) {
    throw new Error(`Test sign-in failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return agent;
}

export async function signedInStudent(): Promise<{ user: TestUser; agent: Agent }> {
  const user = await createStudent();
  return { user, agent: await signIn(user) };
}

export async function signedInAdmin(): Promise<{ user: TestUser; agent: Agent }> {
  const user = await createAdmin();
  return { user, agent: await signIn(user) };
}

/** An agent with no session, for asserting 401s. */
export const anonymous = (): Agent => request.agent(app);
