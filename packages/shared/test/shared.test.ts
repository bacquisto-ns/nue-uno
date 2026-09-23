import { describe, expect, it } from 'vitest';
import {
  CreateTableInput,
  PlayCardInput,
  SaveProfileInput,
  groupKey,
  isCompanyEmail,
  nextUnoHour,
  startOfDayMs,
  placementCounts,
  placementPoints,
  qualifierSummary,
} from '../src/index.js';

describe('isCompanyEmail', () => {
  it('accepts only the company domain', () => {
    expect(isCompanyEmail('Jane.Doe@NueSynergy.com')).toBe(true);
    expect(isCompanyEmail(' jane@nuesynergy.com ')).toBe(true);
    expect(isCompanyEmail('jane@nuesynergy.com.evil.io')).toBe(false);
    expect(isCompanyEmail('jane@evilnuesynergy.com')).toBe(false);
    expect(isCompanyEmail('@nuesynergy.com')).toBe(false);
    expect(isCompanyEmail(null)).toBe(false);
  });
});

describe('scoring (tournament.md §1)', () => {
  it('pays placement points by table size', () => {
    expect([1, 2, 3, 4].map((p) => placementPoints(4, p))).toEqual([10, 6, 3, 1]);
    expect([1, 2, 3].map((p) => placementPoints(3, p))).toEqual([8, 4, 1]);
    expect(placementPoints(2, 1)).toBe(0);
  });

  it('requires 12 turns unless the player forfeited', () => {
    expect(placementCounts(12, false)).toBe(true);
    expect(placementCounts(11, false)).toBe(false);
    expect(placementCounts(3, true)).toBe(true);
  });

  it('matches the worked example: best 10 of 12 = 65', () => {
    const places = [1, 3, 2, 4, 1, 2, 3, 1, 4, 2, 3, 1];
    const sizes = places.map((_, i) => (i === 7 ? 3 : 4));
    const results = places.map((place, i) => ({
      gameId: `g${i}`,
      place,
      points: placementPoints(sizes[i]!, place),
      finishedAtMs: i * 1000,
    }));
    const summary = qualifierSummary(results);
    expect(summary.score).toBe(65);
    expect(summary.wins).toBe(4);
    expect(summary.winRate).toBeCloseTo(1 / 3);
    expect(summary.countedGameIds).toHaveLength(10);
    expect(summary.eligible).toBe(true);
    expect(summary.winStreak).toBe(1);
  });

  it('is not eligible under 3 games and handles no games', () => {
    expect(qualifierSummary([{ gameId: 'a', place: 1, points: 10, finishedAtMs: 1 }]).eligible).toBe(
      false,
    );
    expect(qualifierSummary([])).toMatchObject({ score: 0, winRate: 0, avgPlace: 0, winStreak: 0 });
  });

  it('builds order-independent group keys', () => {
    expect(groupKey(['c', 'a', 'b'])).toBe('a_b_c');
  });
});

describe('schemas', () => {
  it('validates profiles', () => {
    expect(
      SaveProfileInput.safeParse({ displayName: '  Priya  ', avatarId: 'fox', attendingEvent: 'yes' })
        .success,
    ).toBe(true);
    expect(
      SaveProfileInput.safeParse({ displayName: 'P', avatarId: 'fox', attendingEvent: 'yes' }).success,
    ).toBe(false);
    expect(
      SaveProfileInput.safeParse({ displayName: '<script>', avatarId: 'fox', attendingEvent: 'yes' })
        .success,
    ).toBe(false);
  });

  it('validates moves and tables', () => {
    expect(
      PlayCardInput.safeParse({
        gameId: 'g1',
        cardId: 'red-7-1',
        clientMoveId: crypto.randomUUID(),
        expectedVersion: 3,
      }).success,
    ).toBe(true);
    expect(
      PlayCardInput.safeParse({ gameId: 'g1', cardId: 'x', clientMoveId: 'nope', expectedVersion: 3 })
        .success,
    ).toBe(false);
    expect(CreateTableInput.safeParse({ maxSeats: 5, requestedMode: 'ranked' }).success).toBe(false);
  });
});

describe('time (season time zone)', () => {
  const TZ = 'America/Chicago';
  const hours = [
    { days: [1, 2, 3, 4, 5], start: '12:00', end: '12:45' },
    { days: [1, 2, 3, 4, 5], start: '16:00', end: '16:30' },
  ];

  it('finds local midnight across DST', () => {
    expect(new Date(startOfDayMs(Date.UTC(2026, 6, 15, 15), TZ)).toISOString()).toBe('2026-07-15T05:00:00.000Z');
    expect(new Date(startOfDayMs(Date.UTC(2026, 11, 1, 3), TZ)).toISOString()).toBe('2026-11-30T06:00:00.000Z');
  });

  it('reports a live Uno Hour, the next one today, and skips weekends', () => {
    // Wed 2026-10-14 12:10 CDT = 17:10 UTC → live lunch slot
    const live = nextUnoHour(Date.UTC(2026, 9, 14, 17, 10), hours, TZ)!;
    expect(live.live).toBe(true);
    expect(new Date(live.startMs).toISOString()).toBe('2026-10-14T17:00:00.000Z');
    // Same day 13:00 CDT → next is 16:00 CDT = 21:00 UTC
    const next = nextUnoHour(Date.UTC(2026, 9, 14, 18, 0), hours, TZ)!;
    expect(next.live).toBe(false);
    expect(new Date(next.startMs).toISOString()).toBe('2026-10-14T21:00:00.000Z');
    // Fri 2026-10-16 17:00 CDT → Monday 12:00 CDT (Oct 19 17:00 UTC)
    const monday = nextUnoHour(Date.UTC(2026, 9, 16, 22, 0), hours, TZ)!;
    expect(new Date(monday.startMs).toISOString()).toBe('2026-10-19T17:00:00.000Z');
  });
});
