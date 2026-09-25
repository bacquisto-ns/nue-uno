import { compareEntries, DEFAULT_SEASON_SETTINGS, pointsToCutLine } from '@nue-uno/shared';

export interface EntryDoc {
  id: string;
  displayName: string;
  avatarId: string;
  avatarColor: string;
  department: string | null;
  attendingEvent: 'yes' | 'no' | 'maybe';
  score: number;
  rankedGames: number;
  wins: number;
  winRate: number;
  avgPlace: number;
  winStreak: number;
  eligible: boolean;
  countedGameIds: string[];
  scoreReachedAt?: { toMillis(): number } | null;
}

export interface Standing extends EntryDoc {
  rank: number;
  /** Position among eligible, attending players — i.e. the projected bracket seed. */
  seed: number | null;
}

/** Sort entries (tournament.md §1) and assign ranks and projected seeds. */
export function buildStandings(entries: readonly EntryDoc[]): Standing[] {
  const sorted = [...entries].sort((a, b) =>
    compareEntries(
      { uid: a.id, score: a.score, winRate: a.winRate, avgPlace: a.avgPlace, scoreReachedAtMs: a.scoreReachedAt?.toMillis() ?? null },
      { uid: b.id, score: b.score, winRate: b.winRate, avgPlace: b.avgPlace, scoreReachedAtMs: b.scoreReachedAt?.toMillis() ?? null },
    ),
  );
  let seed = 0;
  return sorted.map((e, i) => ({
    ...e,
    rank: i + 1,
    seed: e.eligible && e.attendingEvent === 'yes' ? ++seed : null,
  }));
}

export interface MyQualifier {
  score: number;
  counted: number;
  bestN: number;
  gamesPlayed: number;
  minGames: number;
  eligible: boolean;
  seed: number | null;
  inBracket: boolean;
  pointsNeeded: number;
}

/** PRD Q3 "My Qualifier" card: path to the bracket. */
export function myQualifier(standings: readonly Standing[], uid: string, bracketSize: number): MyQualifier {
  const me = standings.find((s) => s.id === uid);
  const { bestN, minGames } = DEFAULT_SEASON_SETTINGS.scoring;
  const seeded = standings.filter((s) => s.seed !== null);
  const inBracket = !!me?.seed && me.seed <= bracketSize;
  return {
    score: me?.score ?? 0,
    counted: me?.countedGameIds.length ?? 0,
    bestN,
    gamesPlayed: me?.rankedGames ?? 0,
    minGames,
    eligible: !!me?.eligible,
    seed: me?.seed ?? null,
    inBracket,
    pointsNeeded: pointsToCutLine(me?.score ?? 0, seeded.map((s) => s.score), bracketSize, inBracket),
  };
}

/** Rank movement since the last snapshot (X13 ▲/▼ chips). */
export function rankDeltas(prev: Record<string, number>, next: readonly Standing[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of next) {
    const before = prev[s.id];
    if (before !== undefined && before !== s.rank) out[s.id] = before - s.rank;
  }
  return out;
}
