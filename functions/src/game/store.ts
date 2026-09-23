import {
  joinState,
  splitState,
  type EngineEvent,
  type GameState,
  type HandDoc,
  type PrivateGameState,
  type PublicGameState,
} from '@nue-uno/engine';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { fail } from '../errors.js';
import type { GameDoc } from './model.js';

export interface LoadedGame {
  ref: DocumentReference;
  game: GameDoc;
  /** Present only for started games. */
  state?: GameState;
  hands?: Record<string, HandDoc>;
  priv?: PrivateGameState & { recentMoveIds?: Record<string, number> };
}

export const gameRef = (gameId: string) => db.doc(`games/${gameId}`);

/** Read the public doc, and for started games every hand plus private state (all in the tx). */
export async function loadGame(tx: Transaction, gameId: string): Promise<LoadedGame> {
  const ref = gameRef(gameId);
  const snap = await tx.get(ref);
  if (!snap.exists) throw fail('not-found', 'GAME_NOT_FOUND', 'That table no longer exists.');
  const game = snap.data() as GameDoc;
  if (!game.players) return { ref, game };

  const [privSnap, ...handSnaps] = await Promise.all([
    tx.get(ref.collection('private').doc('state')),
    ...game.players.map((uid) => tx.get(ref.collection('hands').doc(uid))),
  ]);
  const hands = Object.fromEntries(
    game.players.map((uid, i) => [uid, (handSnaps[i]!.data() ?? { cards: [], drawnCardId: null }) as HandDoc]),
  );
  const priv = privSnap.data() as LoadedGame['priv'];
  const state = joinState(game as unknown as PublicGameState, hands, priv!);
  return { ref, game, state, hands, priv };
}

const pad = (n: number) => String(n).padStart(6, '0');

export interface WriteOptions {
  /** New turn deadline (ms), null to clear, undefined to keep. */
  deadlineMs?: number | null;
  clientMoveId?: string;
  /** Extra meta fields to merge (status, mode, startedAt…). */
  meta?: Record<string, unknown>;
}

/**
 * Persist a new engine state: public doc (+meta), changed hands, private state and the event log.
 * Hidden information only ever goes to hands/{uid} and private/state.
 */
export function writeState(
  tx: Transaction,
  loaded: LoadedGame,
  state: GameState,
  events: EngineEvent[],
  opts: WriteOptions = {},
): void {
  const { ref, game } = loaded;
  const { publicDoc, hands, privateDoc } = splitState(state);
  const firstSeq = (game.lastEventSeq ?? 0) + 1;

  const recent = { ...(loaded.priv?.recentMoveIds ?? {}) };
  if (opts.clientMoveId) {
    recent[opts.clientMoveId] = state.version;
    const entries = Object.entries(recent).sort((a, b) => b[1] - a[1]).slice(0, 50);
    for (const key of Object.keys(recent)) delete recent[key];
    for (const [k, v] of entries) recent[k] = v;
  }

  const update: Record<string, unknown> = {
    ...publicDoc,
    ...opts.meta,
    lastEventSeq: firstSeq + events.length - 1,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (opts.deadlineMs !== undefined) {
    update.turnDeadline = opts.deadlineMs === null ? null : Timestamp.fromMillis(opts.deadlineMs);
  }
  tx.set(ref, update, { merge: true });

  for (const [uid, hand] of Object.entries(hands)) {
    const prev = loaded.hands?.[uid];
    const changed =
      !prev ||
      prev.drawnCardId !== hand.drawnCardId ||
      prev.cards.length !== hand.cards.length ||
      prev.cards.some((c, i) => c.id !== hand.cards[i]!.id);
    if (changed) tx.set(ref.collection('hands').doc(uid), hand);
  }
  tx.set(ref.collection('private').doc('state'), { ...privateDoc, recentMoveIds: recent });

  events.forEach((event, i) => {
    tx.set(ref.collection('events').doc(pad(firstSeq + i)), {
      ...event,
      seq: firstSeq + i,
      at: FieldValue.serverTimestamp(),
    });
  });
}
