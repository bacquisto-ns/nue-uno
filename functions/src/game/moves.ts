import { applyAction, type Action, type EngineEvent, type GameState } from '@nue-uno/engine';
import {
  CatchUnoInput,
  ChooseColorInput,
  ClaimTimeoutInput,
  PlayCardInput,
  SimpleMoveInput,
} from '@nue-uno/shared';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { z } from 'zod';
import { db } from '../admin.js';
import { clock } from '../clock.js';
import { fail } from '../errors.js';
import { parse, requirePlayer } from '../guards.js';
import { getSeason, type Season } from '../season.js';
import { finishGame } from './finish.js';
import type { GameDoc } from './model.js';
import { loadGame } from './store.js';
import { writeState } from './store.js';

type Req = Pick<CallableRequest<unknown>, 'auth' | 'data'>;
export interface MoveResult {
  ok: true;
  version: number;
  duplicate?: true;
}

/** Turn length for whoever is now on turn: Away players get the short timer (ADR-4). */
function deadlineFor(game: GameDoc, state: GameState, season: Season, now: number): number {
  const uid = state.players[state.turn]!;
  const turnMs = state.away[uid] ? season.timers.awayMs : (game.turnMs ?? season.timers.casualMs);
  return now + turnMs + season.timers.graceMs;
}

interface MoveSpec<S extends z.ZodType> {
  schema: S;
  toAction: (input: z.infer<S>, uid: string) => Action;
  /** claimTimeout: any signed-in player may send it; no clientMoveId. */
  isTimeout?: boolean;
}

/**
 * The move transaction template (api.md §1): idempotency → pause → version → clock (Final Lap,
 * deadlines) → engine → persist → finish. The engine is the only authority on the rules.
 */
async function runMove<S extends z.ZodType>(req: Req, spec: MoveSpec<S>): Promise<MoveResult> {
  const { uid } = requirePlayer(req);
  const input = parse(spec.schema, req.data) as z.infer<S> & {
    gameId: string;
    expectedVersion: number;
    clientMoveId?: string;
  };
  const season = await getSeason();

  return db.runTransaction(async (tx) => {
    const loaded = await loadGame(tx, input.gameId);
    const { game } = loaded;

    const known = input.clientMoveId ? loaded.priv?.recentMoveIds?.[input.clientMoveId] : undefined;
    if (known !== undefined) return { ok: true, version: known, duplicate: true };

    if (game.status !== 'in_progress' || !loaded.state) {
      throw fail('failed-precondition', 'GAME_FINISHED', 'This game is not in progress.');
    }
    if (game.paused) throw fail('failed-precondition', 'PAUSED', 'The tournament is paused.');
    if (input.expectedVersion !== game.version) {
      throw fail('failed-precondition', 'STALE_STATE', 'The table moved on — try again.');
    }
    if (!spec.isTimeout && !game.seatUids.includes(uid)) {
      throw fail('permission-denied', 'NOT_SEATED', "You're not playing in this game.");
    }

    const now = clock.now();
    if (spec.isTimeout && (!game.turnDeadline || now < game.turnDeadline.toMillis())) {
      throw fail('failed-precondition', 'DEADLINE_NOT_REACHED', 'There is still time on the clock.');
    }

    let state = loaded.state;
    const events: EngineEvent[] = [];
    if (game.finalLapAt && now >= game.finalLapAt.toMillis() && !state.finalLap.active) {
      const lap = applyAction(state, { type: 'startFinalLap' });
      if (lap.ok) {
        state = lap.state;
        events.push(...lap.events);
      }
    }

    const res = applyAction(state, spec.toAction(input, uid));
    if (!res.ok) throw fail('failed-precondition', res.error, res.message, res.message);
    events.push(...res.events);
    const finished = res.state.phase === 'finished';

    writeState(tx, loaded, res.state, events, {
      clientMoveId: input.clientMoveId,
      deadlineMs: finished ? null : res.turnChanged ? deadlineFor(game, res.state, season, now) : undefined,
    });
    if (finished) finishGame(tx, loaded, res.state, season);
    if (res.events.some((e) => e.type === 'player_forfeited' && e.uid === uid)) {
      tx.set(db.doc(`users/${uid}`), { activeGameId: null }, { merge: true });
    }
    return { ok: true, version: res.state.version };
  });
}

export const playCardHandler = (req: Req) =>
  runMove(req, {
    schema: PlayCardInput,
    toAction: (i, uid) => ({
      type: 'play',
      uid,
      cardId: i.cardId,
      chosenColor: i.chosenColor,
      declareUno: i.declareUno,
    }),
  });

export const drawCardHandler = (req: Req) =>
  runMove(req, { schema: SimpleMoveInput, toAction: (_i, uid) => ({ type: 'draw', uid }) });

export const passTurnHandler = (req: Req) =>
  runMove(req, { schema: SimpleMoveInput, toAction: (_i, uid) => ({ type: 'pass', uid }) });

export const chooseColorHandler = (req: Req) =>
  runMove(req, {
    schema: ChooseColorInput,
    toAction: (i, uid) => ({ type: 'chooseColor', uid, color: i.color }),
  });

export const callUnoHandler = (req: Req) =>
  runMove(req, { schema: SimpleMoveInput, toAction: (_i, uid) => ({ type: 'callUno', uid }) });

export const catchUnoHandler = (req: Req) =>
  runMove(req, {
    schema: CatchUnoInput,
    toAction: (i, uid) => ({ type: 'catchUno', uid, targetUid: i.targetUid }),
  });

export const leaveGameHandler = (req: Req) =>
  runMove(req, { schema: SimpleMoveInput, toAction: (_i, uid) => ({ type: 'forfeit', uid }) });

export const claimTimeoutHandler = (req: Req) =>
  runMove(req, { schema: ClaimTimeoutInput, toAction: () => ({ type: 'timeout' }), isTimeout: true });
