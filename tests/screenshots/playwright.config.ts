import { defineConfig, devices } from '@playwright/test';

/** Captures the README screenshots from a running stack: `pnpm screenshots`. */
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  globalSetup: '../e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3387',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: Number(process.env.SIGMA_SCREENSHOT_SCALE ?? 1),
  },
});
