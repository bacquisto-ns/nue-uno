import { describe, expect, it } from 'vitest';
import { buildStandings, myQualifier, rankDeltas, type EntryDoc } from './standings';

const entry = (id: string, score: number, over: Partial<EntryDoc> = {}): EntryDoc => ({
  id,
  displayName: id,
  avatarId: 'fox',
  avatarColor: 'teal',
  department: null,
  attendingEvent: 'yes',
  score,
  rankedGames: 5,
  wins: 1,
  winRate: 0.2,
  avgPlace: 2,
  winStreak: 0,
  eligible: true,
  countedGameIds: ['a', 'b', 'c', 'd', 'e'],
  ...over,
});

describe('standings', () => {
  it('ranks everyone and seeds only eligible, attending players', () => {
    const s = buildStandings([
      entry('c', 30),
      entry('a', 50, { attendingEvent: 'no' }),
      entry('b', 40),
      entry('d', 45, { eligible: false, rankedGames: 2 }),
    ]);
    expect(s.map((x) => [x.id, x.rank, x.seed])).toEqual([
      ['a', 1, null],
      ['d', 2, null],
      ['b', 3, 1],
      ['c', 4, 2],
    ]);
  });

  it('computes the path to the bracket', () => {
    const s = buildStandings([entry('a', 50), entry('b', 40), entry('c', 30), entry('me', 20)]);
    expect(myQualifier(s, 'me', 2)).toMatchObject({ seed: 4, inBracket: false, pointsNeeded: 21, eligible: true });
    expect(myQualifier(s, 'a', 2)).toMatchObject({ seed: 1, inBracket: true, pointsNeeded: 0 });
    expect(myQualifier(s, 'nobody', 2)).toMatchObject({ score: 0, gamesPlayed: 0, eligible: false });
  });

  it('reports rank movement', () => {
    const next = buildStandings([entry('b', 60), entry('a', 50), entry('c', 10)]);
    expect(rankDeltas({ a: 1, b: 2, c: 3 }, next)).toEqual({ a: -1, b: 1 });
  });
});
