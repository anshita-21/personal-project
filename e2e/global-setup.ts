import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { E2E_DATABASE_URL, REPO_ROOT } from './env';

/**
 * Prepares the end-to-end database: migrations, then the seed.
 *
 * Runs once per `playwright test` invocation. The seed is idempotent, so a
 * repeated run converges on the same catalogue and the same demo accounts -
 * which is what lets the specs assert on seeded content by name.
 *
 * Playwright starts the webServer processes before global setup, so the API may
 * boot against an empty schema for a moment. That is harmless: its readiness
 * probe is `SELECT 1`, and no request is made until the suite starts.
 */
export default function globalSetup(): void {
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
  const schema = path.join(REPO_ROOT, 'prisma', 'schema.prisma');

  const run = (command: string, args: string[]): void => {
    execFileSync(command, args, { cwd: REPO_ROOT, env, stdio: 'inherit' });
  };

  console.log('[e2e] applying migrations to the end-to-end database');
  run('npx', ['prisma', 'migrate', 'deploy', '--schema', schema]);

  console.log('[e2e] seeding demo content');
  run('npx', ['tsx', path.join(REPO_ROOT, 'prisma', 'seed.ts')]);
}
