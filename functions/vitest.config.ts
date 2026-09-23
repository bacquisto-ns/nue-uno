import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      GCLOUD_PROJECT: 'demo-nue-uno',
    },
  },
});
