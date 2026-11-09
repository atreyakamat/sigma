import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.app\.spec\.ts/,
  timeout: 100_000,
  workers: 1,
  reporter: 'list',
});
