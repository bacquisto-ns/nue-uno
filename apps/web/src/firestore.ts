import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { app, usingEmulators } from './firebase';

/**
 * Firestore is the largest dependency (~110 KB gz). It is loaded only once someone is signed in,
 * so the sign-in screen stays light. Import via `loadDb()` from firebase.ts.
 */
export const db = getFirestore(app);
if (usingEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);
