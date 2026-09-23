import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
// Engine events carry optional fields; drop undefined instead of rejecting the write.
db.settings({ ignoreUndefinedProperties: true });
export const adminAuth = getAuth();
