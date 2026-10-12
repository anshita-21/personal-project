import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Environment for the end-to-end suite.
 *
 * Nothing is hardcoded: the e2e database URL is DERIVED from the DATABASE_URL
 * in .env by swapping the database name, so a developer who moved their
 * Postgres to another port or host gets a working e2e run with no extra setup
 * and no credentials duplicated into a config file.
 */
const repoRoot = path.resolve(__dirname, '..');
const envFile = path.join(repoRoot, '.env');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, quiet: true });
}

export const API_PORT = Number(process.env['E2E_API_PORT'] ?? 3100);
export const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 4300);
export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}`;

function deriveE2eDatabaseUrl(): string {
  const explicit = process.env['E2E_DATABASE_URL'];
  if (explicit) {
    return explicit;
  }

  const base = process.env['DATABASE_URL'];
  if (!base) {
    throw new Error(
      'Neither E2E_DATABASE_URL nor DATABASE_URL is set. Copy .env.example to .env and run `npm run db:up`.',
    );
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'examprep';
  if (name.endsWith('_e2e')) {
    return url.toString();
  }
  url.pathname = `/${name}_e2e`;
  return url.toString();
}

export const E2E_DATABASE_URL = deriveE2eDatabaseUrl();

/** Demo accounts created by the seed script. */
export const DEMO_ADMIN = {
  email: process.env['SEED_ADMIN_EMAIL'] ?? 'admin@examprep.dev',
  password: process.env['SEED_ADMIN_PASSWORD'] ?? 'Admin123!',
};

export const DEMO_STUDENT = {
  email: process.env['SEED_STUDENT_EMAIL'] ?? 'student@examprep.dev',
  password: process.env['SEED_STUDENT_PASSWORD'] ?? 'Student123!',
};

export const REPO_ROOT = repoRoot;
