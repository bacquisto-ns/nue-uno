import { describe, expect, it } from 'vitest';
import { computeAwards, pickLeaders, type AwardStatsInput } from '../src/index.js';

const p = (uid: string, over: Partial<AwardStatsInput> = {}): AwardStatsInput => ({
  uid,
  humanGames: 5,
  wild4Played: 0,
  maxCardsHeldInWin: 0,
  catches: 0,
  distinctCoworkers: 0,
  crossDeptPairs: 0,
  ...over,
});

describe('pickLeaders', () => {
  it('breaks ties by fewer games, then shares the award', () => {
    const rows = [p('a', { catches: 4, humanGames: 9 }), p('b', { catches: 4, humanGames: 6 }), p('c', { catches: 3 })];
    expect(pickLeaders(rows, (r) => r.catches).map((r) => r.uid)).toEqual(['b']);
    const shared = [p('z', { catches: 4, humanGames: 6 }), p('b', { catches: 4, humanGames: 6 })];
    expect(pickLeaders(shared, (r) => r.catches).map((r) => r.uid)).toEqual(['b', 'z']);
  });

  it('never awards a zero stat', () => {
    expect(pickLeaders([p('a'), p('b')], (r) => r.wild4Played)).toEqual([]);
  });
});

describe('computeAwards (tournament.md §6)', () => {
  const names = { a: 'Ana', b: 'Ben', c: 'Cy', d: 'Dee' };
  const players = [
    p('a', { humanGames: 12, wild4Played: 7, distinctCoworkers: 9, crossDeptPairs: 6 }),
    p('b', { humanGames: 8, wild4Played: 2, distinctCoworkers: 9, crossDeptPairs: 7, catches: 5, maxCardsHeldInWin: 14 }),
    p('c', { humanGames: 4, catches: 1 }),
    p('d', { humanGames: 2, wild4Played: 30, catches: 30 }), // under 3 games: not eligible
  ];

  it('computes every award, with the Champion last for the TV finale', () => {
    const awards = computeAwards({
      championUid: 'c',
      players,
      names,
      cupLeader: { department: 'Finance', cupScore: 210 },
      pickem: [
        { uid: 'x', displayName: 'Xi', points: 16 },
        { uid: 'y', displayName: 'Yo', points: 16 },
        { uid: 'z', displayName: 'Zed', points: 3 },
      ],
    });
    const byKey = Object.fromEntries(awards.map((a) => [a.key, a]));
    expect(awards.map((a) => a.key)).toEqual(['connector', 'draw4', 'comeback', 'sharpshooter', 'iron', 'cup', 'oracle', 'champion']);
    expect(byKey.connector!.winners).toEqual([{ uid: 'b', displayName: 'Ben' }]); // same coworkers, more cross-dept
    expect(byKey.connector!.statLine).toBe('9 coworkers · 7 other-department opponents');
    expect(byKey.draw4!.winners[0]!.uid).toBe('a'); // Dee's 30 don't count
    expect(byKey.sharpshooter!.statLine).toBe('5 UNO catches');
    expect(byKey.comeback!.statLine).toBe('Won after holding 14 cards');
    expect(byKey.iron!.winners[0]!.displayName).toBe('Ana');
    expect(byKey.cup!.winners).toEqual([{ uid: null, displayName: 'Finance' }]);
    expect(byKey.oracle!.winners.map((w) => w.uid)).toEqual(['x', 'y']); // shared
    expect(byKey.champion!.winners[0]!.displayName).toBe('Cy');
  });

  it('skips awards nobody qualifies for', () => {
    expect(computeAwards({ championUid: null, players: [p('a', { humanGames: 1 })], names: {}, cupLeader: null, pickem: [] })).toEqual([]);
  });
});
