import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT_ID = 'demo-nue-uno';

/** Emulator address from `firebase emulators:exec` (firebase.test.json ports by default). */
function hostPort(env: string | undefined, fallback: number) {
  const [host, port] = (env ?? `127.0.0.1:${fallback}`).split(':');
  return { host: host!, port: Number(port) };
}

export function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8180),
    },
    database: {
      rules: readFileSync(resolve(process.cwd(), 'database.rules.json'), 'utf8'),
      ...hostPort(process.env.FIREBASE_DATABASE_EMULATOR_HOST, 9100),
    },
  });
}

/** Token claims for the personas the rules care about. */
export const personas = {
  player: { email: 'player@nuesynergy.com', email_verified: true, active: true },
  other: { email: 'other@nuesynergy.com', email_verified: true, active: true },
  admin: { email: 'admin@nuesynergy.com', email_verified: true, active: true, admin: true },
  pending: { email: 'pending@nuesynergy.com', email_verified: true },
  unverified: { email: 'unverified@nuesynergy.com', email_verified: false, active: true },
  outsider: { email: 'someone@gmail.com', email_verified: true, active: true },
  lookalike: { email: 'x@nuesynergy.com.evil.io', email_verified: true, active: true },
} as const;
