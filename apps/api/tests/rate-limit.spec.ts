import request from 'supertest';
import type { Express } from 'express';
import type * as AppModule from '../src/app';
import { createStudent } from '../src/testing/fixtures';
import { resetDatabase } from '../src/testing/db';

/**
 * The rest of the integration suite runs with rate limiting off, so this file
 * is the one that proves the limiter exists and works.
 *
 * It rebuilds the app in an isolated module registry with
 * RATE_LIMIT_ENABLED=true, because the limiter reads the flag when the
 * middleware is constructed at import time.
 */
describe('rate limiting (forced on)', () => {
  let app: Express;

  // A fresh app per test, because the limiter keeps its counters in an
  // in-memory store: reusing one app would carry the previous test's exhausted
  // budget into the next one.
  beforeEach(async () => {
    process.env['RATE_LIMIT_ENABLED'] = 'true';
    jest.isolateModules(() => {
      // A synchronous require: the suite runs as CommonJS, so a dynamic
      // import() would need --experimental-vm-modules.
      const appModule = require('../src/app') as typeof AppModule;
      app = appModule.createApp();
    });
    await resetDatabase();
  });

  afterEach(() => {
    delete process.env['RATE_LIMIT_ENABLED'];
  });

  it('returns 429 with the standard envelope after too many failed logins', async () => {
    const user = await createStudent({ password: 'Password123' });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'DefinitelyWrong1' });
      statuses.push(response.status);
      if (response.status === 429) {
        expect(response.body.error.code).toBe('RATE_LIMITED');
        // draft-7 reports the budget in a single combined RateLimit header.
        expect(response.headers['ratelimit']).toMatch(/limit=10/);
        break;
      }
    }

    expect(statuses).toContain(429);
    // The limit is 10 failures per window, so the block must not arrive on the
    // very first attempt either.
    expect(statuses.filter((status) => status === 401).length).toBeGreaterThanOrEqual(5);
  });

  it('does not spend a successful sign-in against the login budget', async () => {
    const user = await createStudent({ password: 'Password123' });

    for (let attempt = 0; attempt < 15; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'Password123' });
      expect(response.status).toBe(200);
    }
  });

  it('leaves reads unthrottled at normal volumes', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await request(app).get('/api/v1/exams');
      expect(response.status).toBe(200);
    }
  });
});
