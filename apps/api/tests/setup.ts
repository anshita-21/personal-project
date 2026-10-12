import { disconnectPrisma } from '../src/db/prisma';
import { resetDatabase } from '../src/testing/db';

// Hashing is deliberately expensive (scrypt, N = 2^15). A handful of fixture
// users per test file adds up, so the per-test timeout is raised rather than
// weakening the production cost parameters for tests.
jest.setTimeout(30_000);

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectPrisma();
});
