/**
 * Grant (or revoke) the `admin` custom claim for a user (architecture ADR-3).
 *
 *   node scripts/grant-admin.ts someone@nuesynergy.com --project nue-uno-dev
 *   node scripts/grant-admin.ts someone@nuesynergy.com --project nue-uno-dev --revoke
 *
 * Auth: Application Default Credentials (`gcloud auth application-default login`) with access to
 * the project, or FIREBASE_AUTH_EMULATOR_HOST for the local emulator. The user must have signed in
 * once. Admins also get `active: true`. They must sign out/in (or refresh their token) to pick it up.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const email = args.find((a) => a.includes('@'))?.toLowerCase();
const projectId = args[args.indexOf('--project') + 1];
const revoke = args.includes('--revoke');

if (!email || !email.endsWith('@nuesynergy.com') || !args.includes('--project') || !projectId) {
  console.error('Usage: node scripts/grant-admin.ts <email@nuesynergy.com> --project <id> [--revoke]');
  process.exit(1);
}

initializeApp({ projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...user.customClaims, admin: !revoke, ...(revoke ? {} : { active: true }) };
await auth.setCustomUserClaims(user.uid, claims);
await getFirestore().doc(`users/${user.uid}`).set({ isAdmin: !revoke }, { merge: true });
console.log(`${revoke ? 'Revoked' : 'Granted'} admin for ${email} (${user.uid}) on ${projectId}`);
