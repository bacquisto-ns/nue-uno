import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateBracket, matchOutcome, pickemScore, resolveSlots, tableSizes } from '../src/index.js';

const seedsOf = (m: { slots: ({ seed: number } | { matchId: string; place: number })[] }) =>
  m.slots.map((s) => ('seed' in s ? s.seed : `${s.matchId}#${s.place}`));

describe('generateBracket', () => {
  it('matches the documented 16-player bracket exactly', () => {
    const b = generateBracket(16);
    expect(b.rounds.map((r) => [r.name, r.matchIds])).toEqual([
      ['Round 1', ['R1-A', 'R1-B', 'R1-C', 'R1-D']],
      ['Semifinal', ['SF-E', 'SF-F']],
      ['Final', ['FINAL']],
    ]);
    const byId = Object.fromEntries(b.matches.map((m) => [m.matchId, m]));
    expect(seedsOf(byId['R1-A']!)).toEqual([1, 8, 9, 16]);
    expect(seedsOf(byId['R1-B']!)).toEqual([2, 7, 10, 15]);
    expect(seedsOf(byId['R1-C']!)).toEqual([3, 6, 11, 14]);
    expect(seedsOf(byId['R1-D']!)).toEqual([4, 5, 12, 13]);
    // E: A1 C1 B2 D2 · F: B1 D1 A2 C2
    expect(seedsOf(byId['SF-E']!)).toEqual(['R1-A#1', 'R1-C#1', 'R1-B#2', 'R1-D#2']);
    expect(seedsOf(byId['SF-F']!)).toEqual(['R1-B#1', 'R1-D#1', 'R1-A#2', 'R1-C#2']);
    expect(seedsOf(byId.FINAL!)).toEqual(['SF-E#1', 'SF-F#1', 'SF-E#2', 'SF-F#2']);
    expect(byId.FINAL!.gamesToPlay).toBe(3);
    expect(byId['R1-D']!.physicalTable).toBe(4);
    for (const s of [0, 1, 2, 3]) expect([1, 8, 9, 16, 2, 7, 10, 15, 3, 6, 11, 14, 4, 5, 12, 13].slice(s * 4, s * 4 + 4).reduce((a, b) => a + b)).toBe(34);
  });

  it('matches the documented shapes for 8, 10, 12 and 20 players', () => {
    const shape = (n: number) =>
      generateBracket(n).rounds.map((r) => r.matchIds.map((id) => generateBracket(n).matches.find((m) => m.matchId === id)!.slots.length));
    expect(shape(8)).toEqual([[4, 4], [4]]);
    expect(shape(10)).toEqual([[3, 3, 4], [3, 3], [4]]);
    expect(shape(12)).toEqual([[4, 4, 4], [3, 3], [4]]);
    expect(shape(20)).toEqual([[4, 4, 4, 4, 4], [3, 3, 4], [3, 3], [4]]);
    expect(generateBracket(4).rounds.map((r) => r.name)).toEqual(['Final']);
    expect(() => generateBracket(2)).toThrow();
    expect(tableSizes(10)).toEqual([3, 3, 4]);
    expect(tableSizes(5)).toEqual([2, 3]);
    expect(tableSizes(9)).toEqual([3, 3, 3]);
    expect(matchOutcome(['x', 'y'], [], 0, false)).toMatchObject({ complete: true, advancing: ['x', 'y'] });
  });

  it('property: every seed plays once in round 1, every table has 3–4 seats, table-mates split up', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 64 }), (n) => {
        const b = generateBracket(n);
        const r1 = b.matches.filter((m) => m.round === 1);
        expect(r1.flatMap(seedsOf).sort((a, c) => Number(a) - Number(c))).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        for (const m of b.matches) expect(m.slots.length).toBeGreaterThanOrEqual(n === 5 && m.round === 1 ? 2 : 3);
        for (const m of b.matches) if (m.slots.length === 2) expect(m.gamesToPlay).toBe(0);
        for (const m of b.matches) expect(m.slots.length).toBeLessThanOrEqual(4);
        for (const m of b.matches.filter((x) => x.round > 1 && x.matchId !== 'FINAL')) {
          const origins = m.slots.map((s) => ('matchId' in s ? s.matchId : ''));
          // With ≥ 2 tables in the round, no two players from the same previous table meet again.
          if (b.rounds.find((r) => r.number === m.round)!.matchIds.length > 1) {
            expect(new Set(origins).size).toBe(origins.length);
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe('matchOutcome', () => {
  const game = (order: string[], at: number) => ({
    finishedAtMs: at,
    placements: order.map((uid, i) => ({ uid, place: i + 1, points: [10, 6, 3, 1][i]! })),
  });

  it('single game: top 2 advance in placement order', () => {
    const o = matchOutcome(['a', 'b', 'c', 'd'], [game(['c', 'a', 'd', 'b'], 1)], 1, false);
    expect(o).toMatchObject({ complete: true, advancing: ['c', 'a'] });
  });

  it('final: points, then wins, then last-game placement; incomplete until all games are in', () => {
    const slots = ['a', 'b', 'c', 'd'];
    expect(matchOutcome(slots, [game(['a', 'b', 'c', 'd'], 1)], 3, true)).toMatchObject({ complete: false, advancing: [] });
    // a: 10+1+6=17 (1 win) · b: 6+10+1=17 (1 win) · c: 3+6+10=19 · last game c,a,d,b
    const o = matchOutcome(slots, [game(['a', 'b', 'c', 'd'], 1), game(['b', 'c', 'd', 'a'], 2), game(['c', 'a', 'd', 'b'], 3)], 3, true);
    expect(o.standings.map((s) => s.uid)).toEqual(['c', 'a', 'b', 'd']);
    expect(o.advancing).toEqual(['c']);
  });

  it('an admin override decides the match', () => {
    expect(matchOutcome(['a', 'b', 'c'], [], 1, false, ['b', 'c', 'a'])).toMatchObject({ complete: true, advancing: ['b', 'c'] });
  });
});

describe('resolveSlots + pickem', () => {
  it('fills slots from seeds and completed matches', () => {
    const b = generateBracket(8);
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
    const before = resolveSlots(b, seeds, {});
    expect(before['SF-A']).toEqual(['s1', 's4', 's5', 's8']);
    expect(before.FINAL).toEqual([null, null, null, null]);
    const after = resolveSlots(b, seeds, { 'SF-A': ['s5', 's1'], 'SF-B': ['s2', 's7'] });
    expect(after.FINAL).toEqual(['s5', 's2', 's1', 's7']);
  });

  it('scores picks', () => {
    const s = pickemScore({ champion: 'x', tables: { 'R1-A': 'a', 'R1-B': 'q', FINAL: 'x' } }, { 'R1-A': 'a', 'R1-B': 'b', FINAL: 'x' }, 'x');
    expect(s).toEqual({ points: 3 + 3 + 10, correct: 2, champion: true });
    expect(pickemScore({}, {}, null)).toEqual({ points: 0, correct: 0, champion: false });
  });
});
