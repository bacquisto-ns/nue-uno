import { rankPlayers, type GameState } from '@nue-uno/engine';
import { groupKey, placementCounts, placementPoints } from '@nue-uno/shared';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import type { Season } from '../season.js';
import type { LoadedGame } from './store.js';

/**
 * Write results/{gameId} for every finished human game (data-model.md) and free the seated players.
 * Leaderboard, Passport and stats are derived from results by triggers (ADR-5, Week 3).
 */
export function finishGame(tx: Transaction, loaded: LoadedGame, state: GameState, season: Season): void {
  const { game, ref } = loaded;
  const mode = game.mode ?? 'casual';
  const ranked = mode === 'ranked';
  const tableSize = state.players.length;
  const departments = Object.fromEntries(game.seats.map((s) => [s.uid, s.department]));

  const placements = rankPlayers(state).map((r) => {
    const points = ranked || mode === 'bracket' ? placementPoints(tableSize, r.place, season.scoring) : 0;
    return {
      uid: r.uid,
      department: departments[r.uid] ?? null,
      place: r.place,
      points,
      counts: ranked && placementCounts(state.turnCount, r.forfeited, season.scoring),
      cardsLeft: r.cardsLeft,
      handValue: r.handValue,
      forfeited: r.forfeited,
      stats: state.stats[r.uid],
    };
  });

  tx.set(db.doc(`results/${ref.id}`), {
    seasonId: game.seasonId,
    mode,
    bracketId: game.bracketId ?? null,
    matchId: game.matchId ?? null,
    tableSize,
    turnCount: state.turnCount,
    placements,
    playerUids: state.players,
    groupKey: groupKey(state.players),
    endedBy: state.endedBy,
    finishedAt: FieldValue.serverTimestamp(),
    voided: false,
  });

  tx.set(ref, { status: 'finished', finishedAt: FieldValue.serverTimestamp(), turnDeadline: null }, { merge: true });

  // Players still seated can't be at another table (join checks activeGameId), so clearing is safe.
  for (const uid of state.players) {
    if (!state.forfeited.includes(uid)) {
      tx.set(db.doc(`users/${uid}`), { activeGameId: null }, { merge: true });
    }
  }
}
