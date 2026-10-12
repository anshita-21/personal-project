import { defineConfig, devices } from '@playwright/test';
import { API_PORT, BASE_URL, E2E_DATABASE_URL, WEB_PORT } from './e2e/env';

/**
 * End-to-end configuration.
 *
 * The suite drives a REAL stack: the Express API on port 3100 against its own
 * PostgreSQL database (examprep_e2e), and the Angular dev server on 4300
 * proxying /api and /graphql to it. Nothing is mocked - these tests are the
 * only ones that prove the browser, the API, the cookie and the database agree.
 *
 * A dedicated database matters: the suite seeds and mutates data, and pointing
 * it at the development database would make failures depend on whatever state a
 * developer happened to leave behind.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // The suite shares one database, so parallel workers would see each other's
  // writes. Each test still creates its own account, which keeps them
  // independent in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run e2e:api',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'production',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        CORS_ORIGINS: `${BASE_URL},http://localhost:${WEB_PORT}`,
        LOG_LEVEL: 'warn',
        COOKIE_SECURE: 'false',
        // The suite registers and signs in many accounts from one address;
        // the limiter has its own integration test instead.
        RATE_LIMIT_ENABLED: 'false',
      },
    },
    {
      command: 'npm run e2e:web',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        E2E_API_PORT: String(API_PORT),
        E2E_WEB_PORT: String(WEB_PORT),
        API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
});
