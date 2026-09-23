import { DEFAULT_SEASON_SETTINGS } from './constants.js';

type Scoring = {
  pointsByTableSize: Record<string, readonly number[]>;
  bestN: number;
  minGames: number;
  minTurnsForPoints: number;
};

const defaults: Scoring = DEFAULT_SEASON_SETTINGS.scoring;

/** Placement points for a ranked game (docs/engineering/tournament.md §1). 0 if not scored. */
export function placementPoints(tableSize: number, place: number, scoring: Scoring = defaults): number {
  const table = scoring.pointsByTableSize[String(tableSize)];
  return table?.[place - 1] ?? 0;
}

/**
 * Does this placement count toward the qualifier score? Short games (< minTurnsForPoints) pay
 * nobody — except forfeiters, who keep their last-place result so quitting can't dodge a loss.
 */
export function placementCounts(
  turnCount: number,
  forfeited: boolean,
  scoring: Scoring = defaults,
): boolean {
  return turnCount >= scoring.minTurnsForPoints || forfeited;
}

export interface CountedResult {
  gameId: string;
  points: number;
  place: number;
  finishedAtMs: number;
}

export interface QualifierSummary {
  score: number;
  rankedGames: number;
  wins: number;
  winRate: number;
  avgPlace: number;
  countedGameIds: string[];
  eligible: boolean;
  /** Current run of consecutive wins, most recent first. */
  winStreak: number;
}

/** Best-N qualifier score from a player's counting, non-voided ranked results. */
export function qualifierSummary(
  results: readonly CountedResult[],
  scoring: Scoring = defaults,
): QualifierSummary {
  const rankedGames = results.length;
  const wins = results.filter((r) => r.place === 1).length;
  const best = [...results]
    .sort((a, b) => b.points - a.points || a.finishedAtMs - b.finishedAtMs)
    .slice(0, scoring.bestN);
  const chronological = [...results].sort((a, b) => b.finishedAtMs - a.finishedAtMs);
  let winStreak = 0;
  for (const r of chronological) {
    if (r.place !== 1) break;
    winStreak++;
  }
  return {
    score: best.reduce((sum, r) => sum + r.points, 0),
    rankedGames,
    wins,
    winRate: rankedGames ? wins / rankedGames : 0,
    avgPlace: rankedGames ? results.reduce((s, r) => s + r.place, 0) / rankedGames : 0,
    countedGameIds: best.map((r) => r.gameId),
    eligible: rankedGames >= scoring.minGames,
    winStreak,
  };
}

/** Sorted UIDs joined with "_" — identifies an exact group of players for anti-collusion. */
export function groupKey(uids: readonly string[]): string {
  return [...uids].sort().join('_');
}
