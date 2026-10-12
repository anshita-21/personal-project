import type { Config } from 'jest';

/**
 * Two Jest projects, because the two kinds of test have different costs and
 * different failure meanings:
 *
 *   unit        - `src/**\/*.spec.ts`. Pure logic, no database, milliseconds.
 *   integration - `tests/**\/*.spec.ts`. Real Express app + real PostgreSQL via
 *                 Supertest. Slower, but the only way to prove that
 *                 authorization, transactions and HTTP status codes behave.
 *
 * Run one project with `npm run test:unit` / `npm run test:integration`.
 */
const common = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  clearMocks: true,
} as const;

const config: Config = {
  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...common,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/**/*.spec.ts'],
      globalSetup: '<rootDir>/tests/global-setup.ts',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
  ],
  // The integration tests share one database, so running their files in
  // parallel would have them truncate each other's fixtures. `npm test` also
  // passes --runInBand; this makes the constraint explicit in the config.
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/server.ts',
    '!src/testing/**',
    '!src/docs/openapi.ts',
  ],
  coverageReporters: ['text-summary', 'lcov'],
};

export default config;
