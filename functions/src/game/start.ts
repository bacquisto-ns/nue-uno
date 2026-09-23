import { randomInt } from 'node:crypto';
import { createGame } from '@nue-uno/engine';
import { groupKey, startOfDayMs } from '@nue-uno/shared';
import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { clock } from '../clock.js';
import { isEmulator } from '../env.js';
import { qualifiersOpen, type Season } from '../season.js';
import type { GameDoc, GameMode } from './model.js';
import { writeState, type LoadedGame } from './store.js';

export interface StartPlan {
  mode: GameMode;
  collusionWarning: boolean;
}

/**
 * Decide the final mode (tournament.md §1). Must run before any tx writes: it may query results
 * for the anti-collusion check.
 */
export async function planStart(
  tx: Transaction,
  game: GameDoc,
  seatUids: string[],
  season: Season,
): Promise<StartPlan> {
  if (game.bracketId) return { mode: 'bracket', collusionWarning: false };
  if (game.requestedMode !== 'ranked') return { mode: 'casual', collusionWarning: false };
  const now = clock.now();
  if (seatUids.length < 3 || !qualifiersOpen(season, now)) {
    return { mode: 'casual', collusionWarning: false };
  }
  const since = Timestamp.fromMillis(startOfDayMs(now, season.timezone));
  const today = await tx.get(
    db
      .collection('results')
      .where('seasonId', '==', season.id)
      .where('groupKey', '==', groupKey(seatUids))
      .where('finishedAt', '>=', since),
  );
  const played = today.docs.filter((d) => d.get('mode') === 'ranked' && !d.get('voided')).length;
  const blocked = played >= season.scoring.maxSameGroupPerDay;
  return { mode: blocked ? 'casual' : 'ranked', collusionWarning: blocked };
}

function newSeed(): number {
  const forced = isEmulator ? process.env.NUE_UNO_TEST_SEED : undefined;
  return forced !== undefined ? Number(forced) : randomInt(0, 2 ** 31 - 1);
}

/** Deal and start the game inside the transaction (after all reads). */
export function startInTx(
  tx: Transaction,
  loaded: LoadedGame,
  seatUids: string[],
  plan: StartPlan,
  season: Season,
): void {
  const now = clock.now();
  const { state, events } = createGame(seatUids, newSeed());
  const turnMs = plan.mode === 'bracket' ? season.timers.bracketMs : plan.mode === 'ranked' ? season.timers.rankedMs : season.timers.casualMs;
  const capMin = plan.mode === 'bracket' ? season.finalLap.bracketMin : season.finalLap.qualifierMin;
  writeState(tx, { ...loaded, hands: undefined, priv: undefined }, state, events, {
    deadlineMs: now + turnMs + season.timers.graceMs,
    meta: {
      status: 'in_progress',
      mode: plan.mode,
      collusionWarning: plan.collusionWarning,
      turnMs,
      finalLapAt: Timestamp.fromMillis(now + capMin * 60_000),
      paused: false,
      startedAt: FieldValue.serverTimestamp(),
    },
  });
}
