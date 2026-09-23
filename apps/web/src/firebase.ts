import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const env = import.meta.env;
export const usingEmulators = env.VITE_USE_EMULATORS === 'true' || !env.VITE_FIREBASE_API_KEY;

const config = usingEmulators && !env.VITE_FIREBASE_API_KEY
  ? {
      apiKey: 'demo-key',
      authDomain: 'demo-nue-uno.firebaseapp.com',
      projectId: 'demo-nue-uno',
      databaseURL: 'http://127.0.0.1:9000?ns=demo-nue-uno',
      appId: 'demo-app',
    }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      databaseURL: env.VITE_FIREBASE_DATABASE_URL,
      appId: env.VITE_FIREBASE_APP_ID,
    };

export const app = initializeApp(config);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'us-central1');

void setPersistence(auth, browserLocalPersistence);

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

/** Lazily load Firestore (see firestore.ts). */
export const loadDb = () => import('./firestore').then((m) => m.db);
