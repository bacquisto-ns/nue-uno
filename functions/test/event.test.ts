import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/admin.js';
import { onResultWrittenHandler } from '../src/derived/recompute.js';
import {
  broadcastHandler,
  checkInAtTableHandler,
  checkInMatchHandler,
  editBracketSeedsHandler,
  generateBracketHandler,
  lockBracketHandler,
  overrideMatchResultHandler,
  pauseAllHandler,
  restartMatchGameHandler,
  resumeAllHandler,
  setSeasonHandler,
  setTvSceneHandler,
  submitPicksHandler,
} from '../src/event/callables.js';
import { drawCardHandler, leaveGameHandler } from '../src/game/moves.js';
import { call, makePlayer, makeUser, readGame, reasonOf, resetEmulators, type Ctx } from './helpers.js';

const SEASON = 'connections-2026';
beforeEach(resetEmulators);

async function admin(): Promise<Ctx> {
  return makeUser('boss', 'boss@nuesynergy.com', { active: true, admin: true });
}

/** Players with leaderboard entries: p1 best … pN worst. */
async function field(n: number, extra: Record<string, (i: number) => unknown> = {}) {
  const players: Record<string, Ctx> = {};
  for (let i = 1; i <= n; i++) {
    const name = `P${i}x`;
    players[name.toLowerCase()] = await makePlayer(name);
    await db.doc(`leaderboard/${SEASON}/entries/${name.toLowerCase()}`).set({
      displayName: name,
      score: 100 - i,
      winRate: 0.5,
      avgPlace: 2,
      eligible: true,
      attendingEvent: extra.attending ? extra.attending(i) : 'yes',
      rankedGames: 5,
    });
  }
  return players;
}

/** Finish the running game of a match by forfeits; `order` = finishing order (winner first). */
async function playOut(gameId: string, order: string[], players: Record<string, Ctx>) {
  for (const uid of [...order].reverse().slice(0, -1)) {
    const v = (await readGame(gameId)).version as number;
    await leaveGameHandler(call(players[uid]!, { gameId, expectedVersion: v, clientMoveId: crypto.randomUUID() }));
  }
  const result = (await db.doc(`results/${gameId}`).get()).data();
  await onResultWrittenHandler(undefined, result);
}

const match = async (bracketId: string, id: string) => (await db.doc(`brackets/${bracketId}/matches/${id}`).get()).data()!;

describe('bracket lifecycle', () => {
  it('generates from eligible attendees, locks, checks in, plays, advances and crowns a champion', async () => {
    const boss = await admin();
    const p = await field(9, { attending: (i) => (i === 3 ? 'no' : 'yes') }); // p3x is remote → skipped
    expect(await reasonOf(generateBracketHandler(call(p.p1x!, {})))).toBe('NOT_ADMIN');

    const { bracketId, size } = await generateBracketHandler(call(boss, { size: 8 }));
    expect(size).toBe(8);
    const bracket = (await db.doc(`brackets/${bracketId}`).get()).data()!;
    expect(bracket.status).toBe('draft');
    expect(bracket.seeds.map((s: { uid: string }) => s.uid)).not.toContain('p3x');
    expect((await match(bracketId, 'SF-A')).slots).toEqual(['p1x', 'p5x', 'p6x', 'p9x']);

    // Picks are closed until the bracket is locked.
    expect(await reasonOf(submitPicksHandler(call(p.p2x!, { bracketId, champion: 'p1x' })))).toBe('PICKS_LOCKED');

    await lockBracketHandler(call(boss, { bracketId }));
    const sfA = await match(bracketId, 'SF-A');
    expect(sfA.status).toBe('ready');
    expect((await db.collection('inbox/p1x/items').where('type', '==', 'match_ready').get()).size).toBe(1);

    const picks = await submitPicksHandler(call(p.p2x!, { bracketId, champion: 'p1x', tables: { 'SF-A': 'p1x', 'SF-B': 'p4x' } }));
    expect(picks.rejected).toEqual([]);

    // Check-in: three via callable, the last via the QR code at physical table 1 → the game deals.
    for (const u of ['p1x', 'p5x', 'p6x']) expect(await checkInMatchHandler(call(p[u]!, { bracketId, matchId: 'SF-A' }))).toEqual({ ok: true });
    const qr = await checkInAtTableHandler(call(p.p9x!, { physicalTable: 1 }));
    expect(qr.gameId).toBeTruthy();
    const game = await readGame(qr.gameId!);
    expect(game).toMatchObject({ mode: 'bracket', status: 'in_progress', turnMs: 20_000, matchId: 'SF-A', matchGameNumber: 1 });
    expect(await reasonOf(checkInAtTableHandler(call(p.p2x!, { physicalTable: 1 })))).toBe('NO_MATCH_AT_TABLE');

    await playOut(qr.gameId!, ['p1x', 'p6x', 'p5x', 'p9x'], p);
    expect(await match(bracketId, 'SF-A')).toMatchObject({ status: 'complete', advancing: ['p1x', 'p6x'] });

    // SF-B via check-ins, won by p4x.
    const sfB = await match(bracketId, 'SF-B');
    let gameB = '';
    for (const u of sfB.slots) {
      const r = await checkInMatchHandler(call(p[u]!, { bracketId, matchId: 'SF-B' }));
      if (r.gameId) gameB = r.gameId;
    }
    await playOut(gameB, ['p4x', 'p2x', 'p7x', 'p8x'], p);
    const final = await match(bracketId, 'FINAL');
    expect(final).toMatchObject({ status: 'ready', slots: ['p1x', 'p4x', 'p6x', 'p2x'] });
    // Pick'em: 2 correct tables so far (SF-A p1x, SF-B p4x) = 6 points.
    expect((await db.doc(`pickem/${bracketId}/entries/p2x`).get()).data()).toMatchObject({ points: 6, correct: 2 });
    // Champion picks close once round 1 has started.
    expect((await submitPicksHandler(call(p.p5x!, { bracketId, champion: 'p1x' }))).rejected).toEqual(['champion']);

    // Final: 3 games; the next deals automatically after each finishes.
    let finalGame = '';
    for (const u of final.slots) {
      const r = await checkInMatchHandler(call(p[u]!, { bracketId, matchId: 'FINAL' }));
      if (r.gameId) finalGame = r.gameId;
    }
    for (let g = 1; g <= 3; g++) {
      const current = (await match(bracketId, 'FINAL')).currentGameId as string;
      expect((await readGame(current)).matchGameNumber).toBe(g);
      await playOut(current, ['p1x', 'p4x', 'p6x', 'p2x'], p);
    }
    void finalGame;
    const done = (await db.doc(`brackets/${bracketId}`).get()).data()!;
    expect(done).toMatchObject({ status: 'complete', championUid: 'p1x' });
    expect((await db.doc(`pickem/${bracketId}/entries/p2x`).get()).data()).toMatchObject({ points: 16, champion: true });
  }, 120_000);

  it('reseeds drafts, refuses locked edits, overrides and restarts tables', async () => {
    const boss = await admin();
    const p = await field(8);
    const { bracketId } = await generateBracketHandler(call(boss, {}));
    await editBracketSeedsHandler(call(boss, { bracketId, seeds: [{ seed: 1, uid: 'p8x' }, { seed: 8, uid: 'p1x' }] }));
    expect((await match(bracketId, 'SF-A')).slots).toEqual(['p8x', 'p4x', 'p5x', 'p1x']);
    await lockBracketHandler(call(boss, { bracketId }));
    expect(await reasonOf(editBracketSeedsHandler(call(boss, { bracketId, seeds: [{ seed: 1, uid: 'p1x' }] })))).toBe('BRACKET_LOCKED');

    // Override decides SF-A without a game.
    expect(await reasonOf(overrideMatchResultHandler(call(boss, { bracketId, matchId: 'SF-A', placements: ['p8x'], reason: 'test' })))).toBe('BAD_REQUEST');
    await overrideMatchResultHandler(call(boss, { bracketId, matchId: 'SF-A', placements: ['p5x', 'p8x', 'p4x', 'p1x'], reason: 'machine died' }));
    expect(await match(bracketId, 'SF-A')).toMatchObject({ status: 'complete', advancing: ['p5x', 'p8x'] });

    // Restart: the running game is voided and a fresh one dealt with the same seats.
    const sfB = await match(bracketId, 'SF-B');
    let first = '';
    for (const u of sfB.slots) {
      const r = await checkInMatchHandler(call(p[u]!, { bracketId, matchId: 'SF-B' }));
      if (r.gameId) first = r.gameId;
    }
    const { gameId: second } = await restartMatchGameHandler(call(boss, { bracketId, matchId: 'SF-B', reason: 'network down' }));
    expect(second).not.toBe(first);
    expect((await readGame(first)).status).toBe('voided');
    expect(await readGame(second)).toMatchObject({ status: 'in_progress', matchGameNumber: 1 });
    expect((await db.collection('auditLog').where('action', '==', 'restartMatchGame').get()).size).toBe(1);
  }, 120_000);
});

describe('live event controls', () => {
  it('pause freezes bracket games and resume gives the time back', async () => {
    const boss = await admin();
    const p = await field(4);
    const { bracketId } = await generateBracketHandler(call(boss, {}));
    await lockBracketHandler(call(boss, { bracketId }));
    let gameId = '';
    for (const u of ['p1x', 'p2x', 'p3x', 'p4x']) {
      const r = await checkInMatchHandler(call(p[u]!, { bracketId, matchId: 'FINAL' }));
      if (r.gameId) gameId = r.gameId;
    }
    const before = await readGame(gameId);
    expect((await pauseAllHandler(call(boss, {}))).paused).toBe(1);
    const turnUid = before.turnUid as string;
    expect(await reasonOf(drawCardHandler(call(p[turnUid]!, { gameId, expectedVersion: before.version, clientMoveId: crypto.randomUUID() })))).toBe('PAUSED');
    await new Promise((r) => setTimeout(r, 1200));
    await resumeAllHandler(call(boss, {}));
    const after = await readGame(gameId);
    expect(after.paused).toBe(false);
    expect(after.turnDeadline.toMillis() - before.turnDeadline.toMillis()).toBeGreaterThanOrEqual(1000);
    expect(after.finalLapAt.toMillis() - before.finalLapAt.toMillis()).toBeGreaterThanOrEqual(1000);
  });

  it('broadcast, TV scene and season settings are admin-only and audited', async () => {
    const boss = await admin();
    const ana = await makePlayer('Ana');
    expect(await reasonOf(broadcastHandler(call(ana, { text: 'hi', level: 'info', ttlMinutes: 5 })))).toBe('NOT_ADMIN');
    const { id } = await broadcastHandler(call(boss, { text: 'Round 2 in 5 minutes', level: 'urgent', ttlMinutes: 10 }));
    expect((await db.doc(`announcements/${id}`).get()).data()).toMatchObject({ active: true, level: 'urgent' });
    await setTvSceneHandler(call(boss, { scene: 'pickem', autoCycle: true }));
    expect((await db.doc('tv/state').get()).data()).toMatchObject({ scene: 'pickem', autoCycle: true });
    await setSeasonHandler(call(boss, { status: 'event', bracketSize: 12 }));
    expect((await db.doc(`seasons/${SEASON}`).get()).data()).toMatchObject({ status: 'event', bracketSize: 12 });
    expect(await reasonOf(setSeasonHandler(call(boss, { qualifierStartMs: 2000, qualifierEndMs: 1000 })))).toBe('BAD_REQUEST');
    expect((await db.collection('auditLog').get()).size).toBe(3);
  });
});

describe('admin router', () => {
  it('dispatches actions to their handlers and still requires the admin claim', async () => {
    const { adminRouter, ADMIN_ACTIONS } = await import('../src/event/adminRouter.js');
    const boss = await admin();
    const ana = await makePlayer('Ana');
    expect(ADMIN_ACTIONS).toContain('generateBracket');
    expect(await reasonOf(adminRouter(call(ana, { action: 'setTvScene', payload: { scene: 'cup' } })))).toBe('NOT_ADMIN');
    expect(await reasonOf(adminRouter(call(boss, { action: 'dropDatabase', payload: {} })))).toBe('BAD_REQUEST');
    expect(await adminRouter(call(boss, { action: 'setTvScene', payload: { scene: 'cup' } }))).toEqual({ ok: true });
    expect((await db.doc('tv/state').get()).get('scene')).toBe('cup');
  });
});
