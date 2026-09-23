import { describe, expect, it } from 'vitest';
import {
  compareEntries,
  cupEntryFor,
  leaderboardEntryFor,
  passportFor,
  playerStatsFor,
  pointsToCutLine,
  type ResultDoc,
  type ResultPlacement,
} from '../src/index.js';

const stats = (over: Partial<NonNullable<ResultPlacement['stats']>> = {}) => ({
  cardsPlayed: 5,
  cardsPlayedByValue: { '7': 2, wild4: 1 },
  wild4Played: 1,
  draw2Played: 0,
  cardsDrawn: 3,
  unoCalls: 1,
  catches: 0,
  timesCaught: 0,
  timeouts: 0,
  maxHandSize: 9,
  wild4Victims: { b: 1 },
  ...over,
});

let n = 0;
function result(
  order: string[],
  opts: { mode?: ResultDoc['mode']; turns?: number; voided?: boolean; at?: number; depts?: Record<string, string> } = {},
): ResultDoc {
  n++;
  const size = order.length;
  const pts = size === 4 ? [10, 6, 3, 1] : [8, 4, 1];
  const mode = opts.mode ?? 'ranked';
  const turns = opts.turns ?? 20;
  return {
    id: `g${n}`,
    seasonId: 's',
    mode,
    tableSize: size,
    turnCount: turns,
    playerUids: order,
    finishedAtMs: opts.at ?? n * 1000,
    voided: !!opts.voided,
    placements: order.map((uid, i) => ({
      uid,
      department: opts.depts?.[uid] ?? null,
      place: i + 1,
      points: mode === 'ranked' ? pts[i]! : 0,
      counts: mode === 'ranked' && turns >= 12,
      cardsLeft: i,
      handValue: i * 5,
      forfeited: false,
      stats: stats(),
    })),
  };
}

describe('leaderboardEntryFor', () => {
  it('counts only ranked, counting, non-voided results', () => {
    const results = [
      result(['a', 'b', 'c']),
      result(['b', 'a', 'c']),
      result(['a', 'b', 'c'], { mode: 'casual' }),
      result(['a', 'b', 'c'], { voided: true }),
      result(['a', 'b', 'c'], { turns: 5 }),
    ];
    const e = leaderboardEntryFor('a', results);
    expect(e.rankedGames).toBe(2);
    expect(e.score).toBe(12);
    expect(e.wins).toBe(1);
    expect(e.eligible).toBe(false);
  });

  it('records when the current score was first reached', () => {
    const results = [result(['a', 'b', 'c'], { at: 100 }), result(['b', 'c', 'a'], { at: 200 }), result(['b', 'a', 'c'], { at: 300 })];
    // scores: 8, then 9, then 13 → reached at 300
    expect(leaderboardEntryFor('a', results).scoreReachedAtMs).toBe(300);
    expect(leaderboardEntryFor('z', results).scoreReachedAtMs).toBeNull();
  });

  it('orders by score, win rate, avg place, then who got there first', () => {
    const base = { winRate: 0.5, avgPlace: 2, scoreReachedAtMs: 10 };
    const sorted = [
      { uid: 'late', score: 20, ...base, scoreReachedAtMs: 50 },
      { uid: 'low', score: 10, ...base },
      { uid: 'early', score: 20, ...base },
      { uid: 'better', score: 20, ...base, winRate: 0.9 },
    ].sort(compareEntries);
    expect(sorted.map((e) => e.uid)).toEqual(['better', 'early', 'late', 'low']);
  });
});

describe('passportFor', () => {
  it('stamps distinct coworkers across all human games and tracks departments', () => {
    const depts = { a: 'IT', b: 'Finance', c: 'Sales', d: 'IT' };
    const results = [
      result(['a', 'b', 'c'], { depts, mode: 'casual' }),
      result(['a', 'b', 'd'], { depts }),
      result(['a', 'c', 'b'], { depts, voided: true }),
    ];
    const p = passportFor('a', 'IT', results, ['IT', 'Finance', 'Sales']);
    expect(Object.keys(p.opponents).sort()).toEqual(['b', 'c', 'd']);
    expect(p.opponents.b!.games).toBe(2);
    expect(p.distinctCoworkers).toBe(3);
    expect(p.crossDeptPairs).toBe(2);
    expect(p.departments).toEqual({ Finance: 1, Sales: 1, IT: 1 });
    expect(p.milestones).toContain('all_departments');
    expect(p.milestones).not.toContain('coworkers_5');
  });

  it('awards coworker milestones and keeps extra ones (tutorial)', () => {
    const results = [result(['a', 'b', 'c', 'd']), result(['a', 'e', 'f', 'g'])];
    const p = passportFor('a', null, results, [], ['tutorial']);
    expect(p.milestones).toEqual(['coworkers_5', 'tutorial']);
  });
});

describe('playerStatsFor', () => {
  it('sums per-game stats and tracks the biggest hand held in a win', () => {
    const results = [result(['a', 'b', 'c']), result(['b', 'a', 'c']), result(['a', 'b', 'c'], { voided: true })];
    const s = playerStatsFor('a', results);
    expect(s).toMatchObject({ games: 2, wins: 1, wild4Played: 2, unoCalls: 2, maxCardsHeldInWin: 9 });
    expect(s.cardsPlayedByValue).toEqual({ '7': 4, wild4: 2 });
    expect(s.wild4Victims).toEqual({ b: 2 });
  });
});

describe('cupEntryFor', () => {
  it('matches the worked example: 72+65+40 + 2×5 = 187', () => {
    const members = [
      { uid: 'a', score: 72, rankedGames: 10 },
      { uid: 'b', score: 65, rankedGames: 8 },
      { uid: 'c', score: 40, rankedGames: 5 },
      { uid: 'd', score: 20, rankedGames: 4 },
      { uid: 'e', score: 12, rankedGames: 3 },
      { uid: 'f', score: 8, rankedGames: 2 },
    ];
    const e = cupEntryFor('Finance', members);
    expect(e.cupScore).toBe(187);
    expect(e.topScores.map((t) => t.uid)).toEqual(['a', 'b', 'c']);
    expect(e).toMatchObject({ participants: 5, participationBonus: 10, memberCount: 6 });
  });
});

describe('pointsToCutLine', () => {
  it('reports how many points reach the cut line', () => {
    const scores = [50, 40, 30, 20];
    expect(pointsToCutLine(25, scores, 3, false)).toBe(6);
    expect(pointsToCutLine(60, scores, 3, true)).toBe(0);
    expect(pointsToCutLine(5, [10], 3, false)).toBe(0); // fewer players than seats
  });
});
