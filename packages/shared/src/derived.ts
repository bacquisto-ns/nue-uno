import type { PlayerGameStats } from '@nue-uno/engine';
import { DEFAULT_SEASON_SETTINGS } from './constants.js';
import { qualifierSummary, type QualifierSummary, type Scoring } from './scoring.js';

export interface CupSettings {
  topN: number;
  participationBonus: number;
  participationMinGames: number;
}

/**
 * Pure recomputation of everything derived from results (architecture ADR-5). Triggers call these
 * with the full result history, so re-runs, voids and overrides always converge.
 */

export interface ResultPlacement {
  uid: string;
  department: string | null;
  place: number;
  points: number;
  counts: boolean;
  cardsLeft: number;
  handValue: number;
  forfeited: boolean;
  stats?: PlayerGameStats;
}

export interface ResultDoc {
  id: string;
  seasonId: string;
  mode: 'casual' | 'ranked' | 'bracket';
  tableSize: number;
  turnCount: number;
  placements: ResultPlacement[];
  playerUids: string[];
  finishedAtMs: number;
  voided: boolean;
}

// ---- Qualifier leaderboard ------------------------------------------------------------------

export interface LeaderboardEntryCore extends QualifierSummary {
  /** When the player's current score was reached (final tiebreaker — tournament.md §1). */
  scoreReachedAtMs: number | null;
}

export function leaderboardEntryFor(
  uid: string,
  results: readonly ResultDoc[],
  scoring: Scoring = DEFAULT_SEASON_SETTINGS.scoring,
): LeaderboardEntryCore {
  const counting = results
    .filter((r) => r.mode === 'ranked' && !r.voided)
    .map((r) => ({ r, p: r.placements.find((p) => p.uid === uid) }))
    .filter((x): x is { r: ResultDoc; p: ResultPlacement } => !!x.p && x.p.counts)
    .map(({ r, p }) => ({ gameId: r.id, points: p.points, place: p.place, finishedAtMs: r.finishedAtMs }));
  const summary = qualifierSummary(counting, scoring);

  // Replay chronologically to find when the current score was first reached.
  let reached: number | null = null;
  if (summary.score > 0) {
    const chrono = [...counting].sort((a, b) => a.finishedAtMs - b.finishedAtMs);
    for (let i = 1; i <= chrono.length; i++) {
      if (qualifierSummary(chrono.slice(0, i), scoring).score === summary.score) {
        reached = chrono[i - 1]!.finishedAtMs;
        break;
      }
    }
  }
  return { ...summary, scoreReachedAtMs: reached };
}

export interface RankableEntry {
  uid: string;
  score: number;
  winRate: number;
  avgPlace: number;
  scoreReachedAtMs: number | null;
}

/** Leaderboard order: score ↓, win rate ↓, avg place ↑, earliest to reach the score ↑. */
export function compareEntries(a: RankableEntry, b: RankableEntry): number {
  return (
    b.score - a.score ||
    b.winRate - a.winRate ||
    a.avgPlace - b.avgPlace ||
    (a.scoreReachedAtMs ?? Infinity) - (b.scoreReachedAtMs ?? Infinity) ||
    a.uid.localeCompare(b.uid)
  );
}

// ---- Connection Passport --------------------------------------------------------------------

export interface PassportOpponent {
  displayName?: string;
  department: string | null;
  firstGameId: string;
  firstAtMs: number;
  games: number;
}

export interface Passport {
  opponents: Record<string, PassportOpponent>;
  departments: Record<string, number>;
  distinctCoworkers: number;
  crossDeptPairs: number;
  milestones: string[];
}

export const PASSPORT_MILESTONES = [5, 10, 20] as const;

/** Every human game counts (casual, ranked, bracket); voided games don't (tournament.md §7). */
export function passportFor(
  uid: string,
  myDepartment: string | null,
  results: readonly ResultDoc[],
  allDepartments: readonly string[],
  extraMilestones: readonly string[] = [],
): Passport {
  const opponents: Record<string, PassportOpponent> = {};
  const chrono = [...results].filter((r) => !r.voided).sort((a, b) => a.finishedAtMs - b.finishedAtMs);
  for (const r of chrono) {
    if (!r.playerUids.includes(uid)) continue;
    for (const p of r.placements) {
      if (p.uid === uid) continue;
      const known = opponents[p.uid];
      if (known) known.games++;
      else opponents[p.uid] = { department: p.department, firstGameId: r.id, firstAtMs: r.finishedAtMs, games: 1 };
    }
  }
  const departments: Record<string, number> = {};
  for (const o of Object.values(opponents)) {
    if (o.department) departments[o.department] = (departments[o.department] ?? 0) + 1;
  }
  const distinct = Object.keys(opponents).length;
  const crossDept = Object.values(opponents).filter((o) => o.department && o.department !== myDepartment).length;
  const milestones = [
    ...PASSPORT_MILESTONES.filter((n) => distinct >= n).map((n) => `coworkers_${n}`),
    ...(allDepartments.length > 0 &&
    allDepartments.filter((d) => d !== myDepartment && d !== 'Other').every((d) => departments[d])
      ? ['all_departments']
      : []),
    ...extraMilestones,
  ];
  return { opponents, departments, distinctCoworkers: distinct, crossDeptPairs: crossDept, milestones };
}

// ---- Player stats (awards + Wrapped) --------------------------------------------------------

export interface PlayerStatsAggregate {
  games: number;
  humanGames: number;
  wins: number;
  wild4Played: number;
  draw2Played: number;
  catches: number;
  timesCaught: number;
  unoCalls: number;
  cardsPlayed: number;
  maxCardsHeldInWin: number;
  cardsPlayedByValue: Record<string, number>;
  wild4Victims: Record<string, number>;
}

export function playerStatsFor(uid: string, results: readonly ResultDoc[]): PlayerStatsAggregate {
  const agg: PlayerStatsAggregate = {
    games: 0,
    humanGames: 0,
    wins: 0,
    wild4Played: 0,
    draw2Played: 0,
    catches: 0,
    timesCaught: 0,
    unoCalls: 0,
    cardsPlayed: 0,
    maxCardsHeldInWin: 0,
    cardsPlayedByValue: {},
    wild4Victims: {},
  };
  for (const r of results) {
    if (r.voided) continue;
    const p = r.placements.find((x) => x.uid === uid);
    if (!p) continue;
    agg.games++;
    agg.humanGames++;
    const s = p.stats;
    if (p.place === 1 && !p.forfeited) {
      agg.wins++;
      agg.maxCardsHeldInWin = Math.max(agg.maxCardsHeldInWin, s?.maxHandSize ?? 0);
    }
    if (!s) continue;
    agg.wild4Played += s.wild4Played;
    agg.draw2Played += s.draw2Played;
    agg.catches += s.catches;
    agg.timesCaught += s.timesCaught;
    agg.unoCalls += s.unoCalls;
    agg.cardsPlayed += s.cardsPlayed;
    for (const [v, n] of Object.entries(s.cardsPlayedByValue)) {
      agg.cardsPlayedByValue[v] = (agg.cardsPlayedByValue[v] ?? 0) + (n ?? 0);
    }
    for (const [victim, n] of Object.entries(s.wild4Victims)) {
      agg.wild4Victims[victim] = (agg.wild4Victims[victim] ?? 0) + n;
    }
  }
  return agg;
}

// ---- Department Cup -------------------------------------------------------------------------

export interface CupMember {
  uid: string;
  score: number;
  rankedGames: number;
}

export interface CupEntry {
  department: string;
  cupScore: number;
  topScores: { uid: string; score: number }[];
  participants: number;
  participationBonus: number;
  memberCount: number;
}

/** cupScore = sum of top 3 member scores + 2 × members with ≥ 3 counting games (tournament.md §5). */
export function cupEntryFor(
  department: string,
  members: readonly CupMember[],
  cup: CupSettings = DEFAULT_SEASON_SETTINGS.cup,
): CupEntry {
  const top = [...members].sort((a, b) => b.score - a.score).slice(0, cup.topN);
  const participants = members.filter((m) => m.rankedGames >= cup.participationMinGames).length;
  const participationBonus = participants * cup.participationBonus;
  return {
    department,
    cupScore: top.reduce((s, m) => s + m.score, 0) + participationBonus,
    topScores: top.map((m) => ({ uid: m.uid, score: m.score })),
    participants,
    participationBonus,
    memberCount: members.length,
  };
}

/** Where does `score` sit relative to the Top-N cut line? (PRD Q3 "points needed"). */
export function pointsToCutLine(
  myScore: number,
  sortedScores: readonly number[],
  cutSize: number,
  alreadyIn: boolean,
): number {
  if (alreadyIn) return 0;
  const cutScore = sortedScores[cutSize - 1];
  return cutScore === undefined ? 0 : Math.max(1, cutScore - myScore + 1);
}
