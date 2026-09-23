import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      GCLOUD_PROJECT: 'demo-nue-uno',
      // Lets firebase-admin find the Realtime Database emulator (presence reads in nudges).
      FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-nue-uno', databaseURL: 'http://127.0.0.1:9100?ns=demo-nue-uno' }),
    },
  },
});
