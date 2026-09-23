import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
