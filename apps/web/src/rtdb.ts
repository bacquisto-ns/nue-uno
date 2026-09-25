import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import { app, usingEmulators } from './firebase';

/** Realtime Database — presence, emotes, reactions (ADR-6). Loaded with the signed-in routes. */
export const rtdb = getDatabase(app);
if (usingEmulators) connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
