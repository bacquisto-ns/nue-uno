import { joinState, type GameState, type HandDoc, type PublicGameState } from '@nue-uno/engine';
import { adminAuth, db } from '../src/admin.js';
import { saveProfileHandler } from '../src/profile.js';
import { clearSeasonCache } from '../src/season.js';

const PROJECT = 'demo-nue-uno';

export async function resetEmulators(): Promise<void> {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!fsHost || !authHost) throw new Error('Run via `npm test` (firebase emulators:exec)');
  await fetch(`http://${fsHost}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  clearSeasonCache();
  setClockOffset(0);
}

export function setClockOffset(ms: number): void {
  process.env.NUE_UNO_TEST_CLOCK_OFFSET_MS = String(ms);
}

export type Ctx = { auth: { uid: string; token: never; rawToken: string } };

/** Create an auth user with the given claims (no profile). */
export async function makeUser(uid: string, email: string, claims: Record<string, unknown> = {}): Promise<Ctx> {
  await adminAuth.createUser({ uid, email, emailVerified: true });
  if (Object.keys(claims).length) await adminAuth.setCustomUserClaims(uid, claims);
  return { auth: { uid, token: { email, email_verified: true, ...claims } as never, rawToken: '' } };
}

/** Create an active player with a saved profile. */
export async function makePlayer(name: string, extra: Record<string, unknown> = {}): Promise<Ctx> {
  const uid = name.toLowerCase();
  const ctx = await makeUser(uid, `${uid}@nuesynergy.com`);
  await saveProfileHandler({ ...ctx, data: { displayName: name, avatarId: 'fox', attendingEvent: 'yes', ...extra } });
  return { auth: { ...ctx.auth, token: { ...(ctx.auth.token as object), active: true } as never } };
}

export const call = <D>(ctx: Ctx, data: D) => ({ ...ctx, data });

/** Open the qualifier window on the default season. */
export async function openQualifiers(): Promise<void> {
  await db.doc('seasons/connections-2026').set({
    status: 'qualifying',
    qualifierStart: new Date(Date.now() - 86_400_000),
    qualifierEnd: new Date(Date.now() + 7 * 86_400_000),
  });
  clearSeasonCache();
}

export async function readGame(gameId: string) {
  return (await db.doc(`games/${gameId}`).get()).data()!;
}

/** Reassemble the full engine state straight from Firestore (test-only god view). */
export async function readState(gameId: string): Promise<GameState> {
  const ref = db.doc(`games/${gameId}`);
  const game = (await ref.get()).data() as PublicGameState;
  const priv = (await ref.collection('private').doc('state').get()).data()!;
  const hands: Record<string, HandDoc> = {};
  for (const uid of game.players) {
    hands[uid] = (await ref.collection('hands').doc(uid).get()).data() as HandDoc;
  }
  return joinState(game, hands, priv as never);
}

export async function reasonOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { details?: { reason?: string } }).details?.reason;
  }
}
