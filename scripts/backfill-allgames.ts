/**
 * One-off backfill for the All-games leaderboard: touches every results/{id} doc so the
 * onResultWritten trigger recomputes each player's derived data (idempotent, safe to re-run).
 *
 *   npm run backfill:allgames -- <firebase-project-id>      # e.g. nue-uno-dev
 *
 * Uses Application Default Credentials (`gcloud auth application-default login`). Set
 * FIRESTORE_EMULATOR_HOST to run against the emulators instead.
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const project = process.argv[2];
if (!project) throw new Error('usage: backfill:allgames <firebase-project-id>');

initializeApp({ projectId: project });
const db = getFirestore();

const snap = await db.collection('results').get();
console.log(`Touching ${snap.size} results in ${project}…`);
let n = 0;
for (const doc of snap.docs) {
  await doc.ref.update({ backfilledAt: FieldValue.serverTimestamp() });
  if (++n % 25 === 0) console.log(`  ${n}/${snap.size}`);
}
console.log('Done — derived data recomputes as the triggers run.');
