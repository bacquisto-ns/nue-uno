import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onCall } from 'firebase-functions/v2/https';
import { saveProfileHandler } from './profile.js';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/** Callables — contracts in docs/engineering/api.md. More land in Week 2 (lobby + moves). */
export const saveProfile = onCall((req) => saveProfileHandler(req));
