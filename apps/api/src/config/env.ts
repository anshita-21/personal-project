import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Loads `.env` from the repository root regardless of which workspace the
 * process was started from (`npm run dev -w @examprep/api` runs with cwd set to
 * apps/api, CI runs from the root), then validates the result.
 *
 * Validation is deliberately fail-fast: a service that boots with a missing
 * JWT secret is worse than a service that refuses to boot.
 */
function loadDotEnv(): void {
  const candidates = [
    process.env['ENV_FILE'],
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../../../.env'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, quiet: true });
      return;
    }
  }
}

loadDotEnv();

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters - generate one with `openssl rand -base64 48`'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECURE: booleanish.default(false),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  /** Max accepted JSON body. Keeps a hostile client from exhausting memory. */
  JSON_BODY_LIMIT: z.string().default('100kb'),

  /**
   * Rate limiting switch. Left unset it is ON everywhere except NODE_ENV=test,
   * where a suite issuing hundreds of requests from one address would otherwise
   * make failures depend on test ordering. The end-to-end suite also turns it
   * off explicitly, and one integration test turns it back ON to prove the
   * limiter actually returns 429 (see tests/rate-limit.spec.ts).
   */
  RATE_LIMIT_ENABLED: booleanish.optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

/**
 * In the test environment the integration suite must talk to its own database,
 * never the development one. Swapping it here (rather than in every test file)
 * means a forgotten override cannot wipe development data.
 */
function resolveDatabaseUrl(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (source['NODE_ENV'] === 'test' && source['TEST_DATABASE_URL']) {
    return { ...source, DATABASE_URL: source['TEST_DATABASE_URL'] };
  }
  return source;
}

export const env: Env = parseEnv(resolveDatabaseUrl(process.env));

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Resolved here because the default depends on NODE_ENV. */
export const rateLimitEnabled: boolean = env.RATE_LIMIT_ENABLED ?? !isTest;
