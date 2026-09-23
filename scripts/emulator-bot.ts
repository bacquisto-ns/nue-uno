/**
 * Dev helper: a scripted opponent for local multiplayer testing against the emulators.
 *
 *   npm run bot -- <gameId> [name]
 *
 * Creates (or reuses) a verified @nuesynergy.com user in the Auth emulator, saves a profile, joins
 * the table, then plays whenever it's its turn using the engine's bot policy — through the real
 * callables, exactly like a browser would. Emulator only.
 */
import { botAction, createRandom, joinState, type HandDoc, type PublicGameState } from '@nue-uno/engine';

const PROJECT = 'demo-nue-uno';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

const [gameId, name = 'Bot Bella'] = process.argv.slice(2);
if (!gameId) {
  console.error('Usage: npm run bot -- <gameId> [name]');
  process.exit(1);
}
const email = `${name.toLowerCase().replace(/\W+/g, '.')}@nuesynergy.com`;
const password = 'emulator-only-password';

async function json(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${url}: ${JSON.stringify(body)}`);
  return body;
}

async function signIn(): Promise<{ idToken: string; localId: string }> {
  const key = 'fake-api-key';
  try {
    return await json(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
      method: 'POST',
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
  } catch {
    const created = await json(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
      method: 'POST',
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    // Emulator admin: mark the email verified (magic-link users are verified automatically).
    await json(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: created.localId, emailVerified: true }),
    });
    return signIn();
  }
}

let session = await signIn();
const callFn = async (fn: string, data: unknown) => {
  const res = await fetch(`${FN}/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  if (body.error) throw Object.assign(new Error(body.error.message), { reason: body.error.details?.reason });
  return body.result;
};

await callFn('saveProfile', { displayName: name, avatarId: 'octopus', avatarColor: 'violet', attendingEvent: 'yes' });
session = await signIn(); // pick up the `active` claim
await callFn('joinTable', { gameId });
console.log(`${name} (${session.localId}) joined ${gameId}`);

// Firestore REST (emulator, admin bypass) → plain JS values.
type FsValue = Record<string, unknown>;
const decode = (v: FsValue): unknown => {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(decode);
  if ('mapValue' in v) {
    const fields = (v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, decode(x)]));
  }
  return undefined;
};
const getDoc = async (path: string) => {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return null;
  const body = await res.json();
  return decode({ mapValue: { fields: body.fields } }) as Record<string, unknown>;
};

const random = createRandom(Date.now() | 0);
const me = session.localId;
for (;;) {
  await new Promise((r) => setTimeout(r, 1200));
  const game = (await getDoc(`games/${gameId}`)) as (PublicGameState & { status: string; version: number }) | null;
  if (!game || game.status === 'finished' || game.status === 'abandoned') {
    console.log('Game over:', game?.status);
    break;
  }
  if (game.status !== 'in_progress') continue;
  const hand = (await getDoc(`games/${gameId}/hands/${me}`)) as HandDoc | null;
  if (!hand) continue;
  // The bot only ever sees public state + its own hand; other hands are just counts.
  const hands = Object.fromEntries(
    game.players.map((uid) => [uid, uid === me ? hand : { cards: Array.from({ length: game.handCounts[uid] ?? 0 }, (_, i) => ({ id: `x${i}`, color: 'wild', value: 'wild' })), drawnCardId: null }]),
  );
  const state = joinState(game, hands as never, { drawPile: [], discardPile: game.topCard ? [game.topCard] : [], rngState: 0, consecutiveTimeouts: {}, stats: {} } as never);
  const action = botAction(state, me, random);
  if (!action) continue;
  const base = { gameId, expectedVersion: game.version, clientMoveId: crypto.randomUUID() };
  const fn = { play: 'playCard', draw: 'drawCard', pass: 'passTurn', chooseColor: 'chooseColor', catchUno: 'catchUno', callUno: 'callUno' }[action.type as string];
  if (!fn) continue;
  const { type: _type, uid: _uid, ...rest } = action as Record<string, unknown>;
  try {
    await callFn(fn, { ...base, ...rest });
    console.log(`${name}: ${action.type}`);
  } catch (err) {
    console.log(`${name}: ${action.type} rejected (${(err as { reason?: string }).reason})`);
  }
}
