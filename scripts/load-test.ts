/**
 * Load test (delivery plan Week 5): many tables of bots playing at once through the real
 * callables, measuring how long each move takes to be accepted.
 *
 *   npm run emulators                               # in one terminal
 *   npm run load-test -- [tables=12] [seats=4] [seconds=90]
 *
 * Emulator only. The emulator runs every function in one local Node process, so its numbers are a
 * relative baseline (did a change make moves slower? does anything break under concurrency?), not
 * a prediction of production latency. For the PRD target (p95 < 500 ms) run the same shape of test
 * on dev with real users during the dry run.
 */
import { botAction, createRandom, joinState, type HandDoc, type PublicGameState } from '@nue-uno/engine';

const PROJECT = 'demo-nue-uno';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

const [tables = 12, seats = 4, seconds = 90] = process.argv.slice(2).map(Number);
const password = 'emulator-only-password';
const run = Date.now().toString(36).slice(-4);

async function json(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) } });
  const body = await res.json();
  if (!res.ok) throw new Error(`${url}: ${JSON.stringify(body)}`);
  return body;
}

interface Bot {
  name: string;
  uid: string;
  idToken: string;
}

async function signIn(email: string) {
  return json(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST',
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }) as Promise<{ idToken: string; localId: string }>;
}

async function makeBot(name: string): Promise<Bot> {
  const email = `${name.toLowerCase()}@nuesynergy.com`;
  const created = await json(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  await json(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: created.localId, emailVerified: true }),
  });
  let s = await signIn(email);
  const bot = { name, uid: s.localId, idToken: s.idToken };
  await callFn(bot, 'saveProfile', { displayName: name, avatarId: 'octopus', attendingEvent: 'yes' });
  s = await signIn(email); // pick up the `active` claim
  return { ...bot, idToken: s.idToken };
}

class CallError extends Error {
  constructor(
    message: string,
    public reason?: string,
  ) {
    super(message);
  }
}

async function callFn(bot: Bot, fn: string, data: unknown) {
  const res = await fetch(`${FN}/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bot.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  if (body.error) throw new CallError(body.error.message, body.error.details?.reason);
  return body.result;
}

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
async function getDoc(path: string) {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return null;
  const body = await res.json();
  return decode({ mapValue: { fields: body.fields } }) as Record<string, unknown>;
}

const MOVE_FN: Record<string, string> = { play: 'playCard', draw: 'drawCard', pass: 'passTurn', chooseColor: 'chooseColor', catchUno: 'catchUno', callUno: 'callUno' };
const latencies: number[] = [];
const rejected: Record<string, number> = {};
let gamesFinished = 0;
const deadline = Date.now() + seconds * 1000;

async function playSeat(bot: Bot, gameId: string, seed: number) {
  const random = createRandom(seed);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300 + random() * 300));
    const game = (await getDoc(`games/${gameId}`)) as (PublicGameState & { status: string; version: number }) | null;
    if (!game || game.status !== 'in_progress') return game?.status;
    const hand = (await getDoc(`games/${gameId}/hands/${bot.uid}`)) as HandDoc | null;
    if (!hand) continue;
    const hands = Object.fromEntries(
      game.players.map((uid) => [uid, uid === bot.uid ? hand : { cards: Array.from({ length: game.handCounts[uid] ?? 0 }, (_, i) => ({ id: `x${i}`, color: 'wild', value: 'wild' })), drawnCardId: null }]),
    );
    const state = joinState(game, hands as never, { drawPile: [], discardPile: game.topCard ? [game.topCard] : [], rngState: 0, consecutiveTimeouts: {}, stats: {} } as never);
    const action = botAction(state, bot.uid, random);
    const fn = action && MOVE_FN[action.type];
    if (!action || !fn) continue;
    const { type: _t, uid: _u, ...rest } = action as Record<string, unknown>;
    const t0 = performance.now();
    try {
      await callFn(bot, fn, { gameId, expectedVersion: game.version, clientMoveId: crypto.randomUUID(), ...rest });
      latencies.push(performance.now() - t0);
    } catch (err) {
      // STALE_STATE is expected now and then (a catch or timeout landed first); the bot re-reads.
      const reason = (err as CallError).reason ?? 'ERROR';
      rejected[reason] = (rejected[reason] ?? 0) + 1;
    }
  }
}

async function runTable(t: number) {
  const bots = await Promise.all(Array.from({ length: seats }, (_, i) => makeBot(`Load${run}T${t}S${i}`)));
  const { gameId } = await callFn(bots[0]!, 'createTable', { maxSeats: seats, requestedMode: 'casual' });
  for (const b of bots.slice(1)) await callFn(b, 'joinTable', { gameId });
  await callFn(bots[0]!, 'startGame', { gameId });
  const outcomes = await Promise.all(bots.map((b, i) => playSeat(b, gameId, t * 97 + i)));
  if (outcomes.includes('finished')) gamesFinished++;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! : NaN;
};

console.log(`Load test: ${tables} tables × ${seats} seats for ${seconds}s against the emulators…`);
const started = Date.now();
const results = await Promise.allSettled(Array.from({ length: tables }, (_, t) => runTable(t)));
const failedTables = results.filter((r) => r.status === 'rejected');
for (const f of failedTables) console.error('Table failed:', (f as PromiseRejectedResult).reason?.message ?? f);

const ms = (x: number) => `${Math.round(x)} ms`;
const elapsed = (Date.now() - started) / 1000;
console.log(`
Moves accepted   ${latencies.length}  (${(latencies.length / elapsed).toFixed(1)}/s over ${elapsed.toFixed(0)}s)
Move latency     p50 ${ms(pct(latencies, 50))} · p95 ${ms(pct(latencies, 95))} · p99 ${ms(pct(latencies, 99))} · max ${ms(Math.max(...latencies))}
Rejected         ${JSON.stringify(rejected)}
Games finished   ${gamesFinished} of ${tables}${failedTables.length ? ` · ${failedTables.length} tables failed to start` : ''}`);
