import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * Deliberately scoped to flows that don't spend money: auth, ownership,
 * the credit gate, and validation. Image generation is never triggered — a
 * suite that bills Gemini on every CI run is a suite people switch off.
 *
 * Needs a Postgres instance. See tests/README.md for the one-liner.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Ownership tests seed and read shared rows; serial keeps them honest.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Some environments ship a preinstalled Chromium whose build doesn't
        // match this Playwright version. Point at it explicitly rather than
        // downloading a second copy; unset, Playwright resolves its own.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],

  // Reuse an already-running server locally; start one in CI.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx next dev --port 3100',
        url: 'http://127.0.0.1:3100/login',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          // A fixed secret keeps sessions valid across server restarts.
          SESSION_SECRET: 'e2e-test-secret-not-used-anywhere-real',
          // No ADMIN_EMAILS: the hardcoded admin default must not make test
          // users admins, or the credit-gate tests silently pass by exemption.
          ADMIN_EMAILS: '',
          // Present but invalid on purpose. Generation routes check for a key
          // before the credit gate, so without one they 503 and the gate is
          // never exercised. No request gets past the gate in these tests, so
          // the key is never actually used.
          GOOGLE_AI_API_KEY: 'e2e-not-a-real-key',
        },
      },
});
