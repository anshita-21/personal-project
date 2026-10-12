import { execFileSync } from 'node:child_process';
import path from 'node:path';
// Importing the config module is what loads the repository-root .env, and it
// also validates the configuration before a single test runs.
import '../src/config/env';

/**
 * Prepares the integration-test database once per run.
 *
 * Safety first: the suite truncates every table, so it refuses to run unless
 * TEST_DATABASE_URL is set AND differs from DATABASE_URL. Without that guard a
 * forgotten environment variable would wipe a developer's working data.
 */
export default function globalSetup(): void {
  const testUrl = process.env['TEST_DATABASE_URL'];
  const devUrl = process.env['DATABASE_URL'];

  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env (and run `npm run db:up`) before running the integration tests.',
    );
  }
  if (devUrl && testUrl === devUrl) {
    throw new Error(
      'TEST_DATABASE_URL must point at a DIFFERENT database than DATABASE_URL - the integration suite truncates every table.',
    );
  }

  const schema = path.resolve(__dirname, '../../../prisma/schema.prisma');
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', schema], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
