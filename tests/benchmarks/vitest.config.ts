import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['headless.bench.test.ts'], testTimeout: 120_000, hookTimeout: 120_000 },
});
