import { describe, expect, it } from 'vitest';
import { dayKey, median, seasonStats, type StatsInput } from '../src/index.js';

const T0 = Date.UTC(2026, 9, 14, 15, 0); // Oct 14 10:00 Chicago
const min = 60_000;

const base: StatsInput = {
  users: [
    { uid: 'a', status: 'active', attendingEvent: 'yes', createdAtMs: T0, firstGameAtMs: T0 + 2 * min },
    { uid: 'b', status: 'active', attendingEvent: 'yes', createdAtMs: T0, firstGameAtMs: T0 + 4 * min },
    { uid: 'c', status: 'active', attendingEvent: 'no', createdAtMs: T0, firstGameAtMs: null },
    { uid: 'd', status: 'pending', attendingEvent: 'yes', createdAtMs: T0, firstGameAtMs: null },
  ],
  rosterSize: 4,
  results: [
    { mode: 'ranked', voided: false, playerUids: ['a', 'b'], finishedAtMs: T0 + 10 * min },
    { mode: 'ranked', voided: true, playerUids: ['a', 'c'], finishedAtMs: T0 + 20 * min },
    { mode: 'casual', voided: false, playerUids: ['a', 'c'], finishedAtMs: T0 + 24 * 60 * min },
  ],
  passports: [
    { uid: 'a', distinctCoworkers: 2, crossDeptPairs: 2 },
    { uid: 'b', distinctCoworkers: 1, crossDeptPairs: 0 },
    { uid: 'c', distinctCoworkers: 0, crossDeptPairs: 0 },
  ],
  pickemUids: ['a'],
  reactionUids: ['x'],
  adminOverrides: 1,
  timeZone: 'America/Chicago',
};

describe('seasonStats (PRD §13)', () => {
  it('computes each metric against its target', () => {
    const { metrics } = seasonStats(base);
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    expect(m.registered).toMatchObject({ value: '3 / 4 (75%)', ok: true });
    expect(m.rankedPlayers).toMatchObject({ value: '2 (67% of registered)', ok: true }); // voided game ignored
    expect(m.rankedGames).toMatchObject({ value: '1', ok: false });
    expect(m.coworkers).toMatchObject({ value: '1.5', ok: false });
    expect(m.crossDept).toMatchObject({ value: '67%', ok: true });
    expect(m.timeToFirst).toMatchObject({ value: '3.0 min', ok: false });
    expect(m.attendeeEngagement).toMatchObject({ value: '50% of 2', ok: false }); // pending user d excluded
    expect(m.overrides).toMatchObject({ value: '1', ok: true });
  });

  it('buckets games by day in the season time zone', () => {
    expect(seasonStats(base).daily).toEqual([
      { day: '2026-10-14', rankedGames: 1, activePlayers: 2 },
      { day: '2026-10-15', rankedGames: 0, activePlayers: 2 },
    ]);
    expect(dayKey(Date.UTC(2026, 9, 15, 3, 0), 'America/Chicago')).toBe('2026-10-14'); // 10 pm local
  });

  it('shows dashes, not zeros, before there is data', () => {
    const { metrics } = seasonStats({ ...base, users: [], rosterSize: 0, results: [], passports: [] });
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    expect(m.coworkers).toMatchObject({ value: '—', ok: null });
    expect(m.registered!.value).toBe('0 registered (no roster)');
  });

  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
