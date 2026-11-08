import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a deployed stack (default: the docker-compose stack on :3000).
 * Set E2E_BASE_URL to target another instance and E2E_ADMIN_PASSWORD when the bootstrap
 * password is not discoverable from `docker compose logs api`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
