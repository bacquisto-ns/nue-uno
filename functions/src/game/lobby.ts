import { CreateTableInput, GameRef } from '@nue-uno/shared';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../admin.js';
import { fail } from '../errors.js';
import { parse, requirePlayer } from '../guards.js';
import { getSeason } from '../season.js';
import type { GameDoc, Seat } from './model.js';
import { gameRef, loadGame } from './store.js';
import { planStart, startInTx } from './start.js';

type Req = Pick<CallableRequest<unknown>, 'auth' | 'data'>;

const LIVE = new Set(['lobby', 'in_progress']);

/** Read the caller's profile and make sure they aren't seated at another live table. */
async function readSeatable(tx: Transaction, uid: string, joiningGameId?: string): Promise<Seat> {
  const userSnap = await tx.get(db.doc(`users/${uid}`));
  const user = userSnap.data();
  if (!user) throw fail('failed-precondition', 'BAD_REQUEST', 'Finish setting up your profile first.');
  const active: string | null = user.activeGameId ?? null;
  if (active && active !== joiningGameId) {
    const other = await tx.get(gameRef(active));
    const stillSeated =
      (other.get('seatUids') ?? []).includes(uid) && !(other.get('forfeited') ?? []).includes(uid);
    if (other.exists && LIVE.has(other.get('status')) && stillSeated) {
      throw fail('failed-precondition', 'ALREADY_SEATED_ELSEWHERE', "You're already seated at another table.");
    }
  }
  return {
    uid,
    displayName: user.displayName,
    avatarId: user.avatarId,
    avatarColor: user.avatarColor ?? 'teal',
    department: user.department ?? null,
  };
}

export async function createTableCore(
  uid: string,
  input: { maxSeats: number; requestedMode: 'casual' | 'ranked' },
  autoStart = false,
): Promise<{ gameId: string }> {
  const season = await getSeason();
  const ref = db.collection('games').doc();
  await db.runTransaction(async (tx) => {
    const seat = await readSeatable(tx, uid);
    const doc: Omit<GameDoc, 'createdAt' | 'updatedAt' | 'turnDeadline' | 'finalLapAt' | 'startedAt' | 'finishedAt'> & Record<string, unknown> = {
      seasonId: season.id,
      status: 'lobby',
      requestedMode: input.requestedMode,
      mode: null,
      hostUid: uid,
      seats: [seat],
      seatUids: [uid],
      maxSeats: input.maxSeats,
      autoStart,
      collusionWarning: false,
      bracketId: null,
      matchId: null,
      turnMs: null,
      paused: false,
      lastEventSeq: 0,
      version: 0,
    };
    tx.set(ref, {
      ...doc,
      turnDeadline: null,
      finalLapAt: null,
      startedAt: null,
      finishedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`users/${uid}`), { activeGameId: ref.id, lastSeenAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { gameId: ref.id };
}

export async function createTableHandler(req: Req) {
  const { uid } = requirePlayer(req);
  return createTableCore(uid, parse(CreateTableInput, req.data));
}

/** Join a lobby table. Tables created by Quick Match start themselves when full. */
export async function joinTableCore(uid: string, gameId: string): Promise<{ ok: true; started: boolean }> {
  const season = await getSeason();
  return db.runTransaction(async (tx) => {
    const loaded = await loadGame(tx, gameId);
    const { game } = loaded;
    if (game.seatUids.includes(uid)) return { ok: true as const, started: game.status !== 'lobby' };
    if (game.status !== 'lobby') throw fail('failed-precondition', 'GAME_FULL', 'That game has already started.');
    if (game.bracketId) throw fail('permission-denied', 'NOT_SEATED', 'Bracket tables have fixed seats.');
    if (game.seatUids.length >= game.maxSeats) throw fail('failed-precondition', 'GAME_FULL', 'That table is full.');

    const seat = await readSeatable(tx, uid, gameId);
    const seats = [...game.seats, seat];
    const seatUids = seats.map((s) => s.uid);
    const willStart = game.autoStart && seats.length >= game.maxSeats;
    const plan = willStart ? await planStart(tx, game, seatUids, season) : null;
    const warning = !willStart && game.requestedMode === 'ranked' && seats.length >= 3
      ? (await planStart(tx, game, seatUids, season)).collusionWarning
      : game.collusionWarning;

    // All reads done — writes below.
    tx.set(loaded.ref, { seats, seatUids, collusionWarning: warning, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.doc(`users/${uid}`), { activeGameId: gameId, lastSeenAt: FieldValue.serverTimestamp() }, { merge: true });
    if (plan) startInTx(tx, { ...loaded, game: { ...game, seats, seatUids } }, seatUids, plan, season);
    return { ok: true as const, started: !!plan };
  });
}

export async function joinTableHandler(req: Req) {
  const { uid } = requirePlayer(req);
  return joinTableCore(uid, parse(GameRef, req.data).gameId);
}

export async function leaveTableHandler(req: Req): Promise<{ ok: true }> {
  const { uid } = requirePlayer(req);
  const { gameId } = parse(GameRef, req.data);
  await db.runTransaction(async (tx) => {
    const { game, ref } = await loadGame(tx, gameId);
    if (game.status !== 'lobby') {
      throw fail('failed-precondition', 'BAD_REQUEST', 'The game has started — use Leave game to forfeit.');
    }
    if (!game.seatUids.includes(uid)) return;
    const seats = game.seats.filter((s) => s.uid !== uid);
    if (seats.length === 0) {
      tx.delete(ref);
    } else {
      tx.set(
        ref,
        {
          seats,
          seatUids: seats.map((s) => s.uid),
          hostUid: game.hostUid === uid ? seats[0]!.uid : game.hostUid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    tx.set(db.doc(`users/${uid}`), { activeGameId: null }, { merge: true });
  });
  return { ok: true };
}

export async function startGameHandler(req: Req): Promise<{ ok: true; mode: string }> {
  const { uid } = requirePlayer(req);
  const { gameId } = parse(GameRef, req.data);
  const season = await getSeason();
  return db.runTransaction(async (tx) => {
    const loaded = await loadGame(tx, gameId);
    const { game } = loaded;
    if (game.status !== 'lobby') throw fail('failed-precondition', 'BAD_REQUEST', 'This game has already started.');
    if (game.hostUid !== uid) throw fail('permission-denied', 'NOT_HOST', 'Only the host can start the game.');
    if (game.seatUids.length < 2) {
      throw fail('failed-precondition', 'NOT_ENOUGH_PLAYERS', 'You need at least 2 players.');
    }
    const plan = await planStart(tx, game, game.seatUids, season);
    startInTx(tx, loaded, game.seatUids, plan, season);
    return { ok: true as const, mode: plan.mode };
  });
}

/**
 * Quick Match (PRD L3): join the open ranked table with the most coworkers the caller hasn't
 * played yet (Passport), oldest first; otherwise open a new 4-seat auto-start table.
 */
export async function quickMatchHandler(req: Req): Promise<{ gameId: string }> {
  const { uid } = requirePlayer(req);
  const [open, passport] = await Promise.all([
    db
      .collection('games')
      .where('status', '==', 'lobby')
      .where('requestedMode', '==', 'ranked')
      .orderBy('createdAt', 'asc')
      .limit(25)
      .get(),
    db.doc(`passport/${uid}`).get(),
  ]);
  const met = new Set(Object.keys(passport.get('opponents') ?? {}));
  const candidates = open.docs
    .map((d) => ({ id: d.id, game: d.data() as GameDoc }))
    .filter(({ game }) => !game.bracketId && game.seatUids.length < game.maxSeats)
    .map((c) => ({ ...c, unmet: c.game.seatUids.filter((u) => u !== uid && !met.has(u)).length }))
    .sort((a, b) => b.unmet - a.unmet);

  for (const c of candidates) {
    if (c.game.seatUids.includes(uid)) return { gameId: c.id };
    try {
      await joinTableCore(uid, c.id);
      return { gameId: c.id };
    } catch (err) {
      const reason = (err as { details?: { reason?: string } }).details?.reason;
      if (reason === 'GAME_FULL' || reason === 'GAME_NOT_FOUND') continue; // raced — try the next one
      throw err;
    }
  }
  return createTableCore(uid, { maxSeats: 4, requestedMode: 'ranked' }, true);
}
