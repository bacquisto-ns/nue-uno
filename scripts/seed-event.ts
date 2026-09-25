/**
 * Emulator-only demo data for event day: an admin plus N ranked, eligible, attending players.
 *
 *   npm run emulators              # in one terminal
 *   npm run seed:event -- 8        # in another (default 8 players)
 *
 * Then sign in as admin@nuesynergy.com (link in the Emulator UI → Authentication), open /admin,
 * generate + lock the bracket, and play tables with `npm run bot -- <gameId> <Name>`.
 * Refuses to run unless it is pointed at the emulators.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
if (!process.env.FIRESTORE_EMULATOR_HOST.startsWith('127.0.0.1') && !process.env.FIRESTORE_EMULATOR_HOST.startsWith('localhost')) {
  throw new Error('seed-event only runs against local emulators');
}

const PROJECT = 'demo-nue-uno';
const SEASON = 'connections-2026';
const count = Number(process.argv[2] ?? 8);
const NAMES = ['Priya', 'Marcus', 'Dana', 'Lee', 'Sofia', 'Omar', 'Grace', 'Theo', 'Nia', 'Kai', 'Ruth', 'Jonah', 'Mei', 'Ivan', 'Zara', 'Eli'];
const DEPTS = ['Finance', 'IT', 'Sales', 'Claims', 'Marketing', 'Operations'];
const AVATARS = ['fox', 'owl', 'bear', 'otter', 'panda', 'tiger', 'koala', 'penguin', 'lion', 'rabbit', 'wolf', 'octopus'];
const COLORS = ['coral', 'amber', 'lime', 'teal', 'sky', 'indigo', 'violet', 'rose'];

initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

async function upsertUser(uid: string, email: string, claims: Record<string, unknown>) {
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, email, emailVerified: true });
  }
  await auth.setCustomUserClaims(uid, claims);
}

await db.doc('config/app').set({ currentSeasonId: SEASON, rosterRequired: false }, { merge: true });
await db.doc(`seasons/${SEASON}`).set({ name: 'Connections 2026 (demo)', bracketSize: 16 }, { merge: true });

await upsertUser('demo-admin', 'admin@nuesynergy.com', { active: true, admin: true });
await db.doc('users/demo-admin').set(
  { email: 'admin@nuesynergy.com', status: 'active', displayName: 'Organizer', avatarId: 'owl', avatarColor: 'violet', department: 'IT', attendingEvent: 'yes', isAdmin: true, activeGameId: null, createdAt: FieldValue.serverTimestamp() },
  { merge: true },
);

for (let i = 0; i < count; i++) {
  const name = NAMES[i % NAMES.length]! + (i >= NAMES.length ? String(i) : '');
  const uid = `demo-${name.toLowerCase()}`;
  const email = `${name.toLowerCase()}@nuesynergy.com`;
  const department = DEPTS[i % DEPTS.length]!;
  await upsertUser(uid, email, { active: true });
  await db.doc(`users/${uid}`).set(
    { email, status: 'active', displayName: name, avatarId: AVATARS[i % AVATARS.length], avatarColor: COLORS[i % COLORS.length], department, attendingEvent: 'yes', activeGameId: null, createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await db.doc(`displayNames/${name.toLowerCase()}`).set({ uid });
  await db.doc(`leaderboard/${SEASON}/entries/${uid}`).set({
    displayName: name,
    avatarId: AVATARS[i % AVATARS.length],
    avatarColor: COLORS[i % COLORS.length],
    department,
    attendingEvent: 'yes',
    score: 90 - i * 3,
    rankedGames: 6,
    wins: Math.max(0, 4 - Math.floor(i / 3)),
    winRate: Math.max(0, 4 - Math.floor(i / 3)) / 6,
    avgPlace: 1.5 + i * 0.1,
    winStreak: i === 0 ? 3 : 0,
    countedGameIds: [],
    eligible: true,
    scoreReachedAt: null,
  });
}
console.log(`Seeded admin@nuesynergy.com + ${count} players into ${PROJECT} (${SEASON}).`);
