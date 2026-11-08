import { defineConfig } from 'vitest/config';

/** Integration tests against a real PostgreSQL (DATABASE_URL or the docker-compose default). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.int.spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
