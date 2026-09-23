import { botAction, createRandom, legalActions, type Action } from '@nue-uno/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/admin.js';
import { approveUserHandler, importRosterHandler } from '../src/admin/roster.js';
import { cleanupStaleGames } from '../src/game/cleanup.js';
import {
  createTableHandler,
  joinTableHandler,
  leaveTableHandler,
  quickMatchHandler,
  startGameHandler,
} from '../src/game/lobby.js';
import {
  callUnoHandler,
  catchUnoHandler,
  chooseColorHandler,
  claimTimeoutHandler,
  drawCardHandler,
  leaveGameHandler,
  passTurnHandler,
  playCardHandler,
} from '../src/game/moves.js';
import { saveProfileHandler } from '../src/profile.js';
import { startOfDayMs } from '@nue-uno/shared';
import {
  call,
  makePlayer,
  makeUser,
  openQualifiers,
  readGame,
  readState,
  reasonOf,
  resetEmulators,
  setClockOffset,
  type Ctx,
} from './helpers.js';

beforeEach(resetEmulators);

async function tableWith(players: Ctx[], requestedMode: 'casual' | 'ranked' = 'casual') {
  const { gameId } = await createTableHandler(call(players[0]!, { maxSeats: 4, requestedMode }));
  for (const p of players.slice(1)) await joinTableHandler(call(p, { gameId }));
  return gameId;
}

async function startedGame(players: Ctx[], requestedMode: 'casual' | 'ranked' = 'casual') {
  const gameId = await tableWith(players, requestedMode);
  const res = await startGameHandler(call(players[0]!, { gameId }));
  return { gameId, mode: res.mode };
}

const move = (gameId: string, version: number) => ({
  gameId,
  expectedVersion: version,
  clientMoveId: crypto.randomUUID(),
});

/** Send an engine Action through the matching callable, as the right player. */
async function send(gameId: string, action: Action, byUid: Record<string, Ctx>) {
  const version = (await readGame(gameId)).version as number;
  const base = move(gameId, version);
  switch (action.type) {
    case 'play':
      return playCardHandler(call(byUid[action.uid]!, { ...base, cardId: action.cardId, chosenColor: action.chosenColor, declareUno: action.declareUno }));
    case 'draw':
      return drawCardHandler(call(byUid[action.uid]!, base));
    case 'pass':
      return passTurnHandler(call(byUid[action.uid]!, base));
    case 'chooseColor':
      return chooseColorHandler(call(byUid[action.uid]!, { ...base, color: action.color }));
    case 'callUno':
      return callUnoHandler(call(byUid[action.uid]!, base));
    case 'catchUno':
      return catchUnoHandler(call(byUid[action.uid]!, { ...base, targetUid: action.targetUid }));
    default:
      throw new Error(`unsupported ${action.type}`);
  }
}

describe('lobby', () => {
  it('creates a table, seats the host and blocks double-seating', async () => {
    const ana = await makePlayer('Ana');
    const { gameId } = await createTableHandler(call(ana, { maxSeats: 3, requestedMode: 'casual' }));
    const game = await readGame(gameId);
    expect(game).toMatchObject({ status: 'lobby', hostUid: 'ana', seatUids: ['ana'], maxSeats: 3 });
    expect((await db.doc('users/ana').get()).get('activeGameId')).toBe(gameId);
    expect(await reasonOf(createTableHandler(call(ana, { maxSeats: 2, requestedMode: 'casual' })))).toBe(
      'ALREADY_SEATED_ELSEWHERE',
    );
  });

  it('joins, rejects when full, transfers host and deletes empty tables', async () => {
    const [ana, ben, cal] = [await makePlayer('Ana'), await makePlayer('Ben'), await makePlayer('Cal')];
    const { gameId } = await createTableHandler(call(ana, { maxSeats: 2, requestedMode: 'casual' }));
    await joinTableHandler(call(ben, { gameId }));
    expect(await reasonOf(joinTableHandler(call(cal, { gameId })))).toBe('GAME_FULL');
    await leaveTableHandler(call(ana, { gameId }));
    expect(await readGame(gameId)).toMatchObject({ hostUid: 'ben', seatUids: ['ben'] });
    await leaveTableHandler(call(ben, { gameId }));
    expect((await db.doc(`games/${gameId}`).get()).exists).toBe(false);
    expect((await db.doc('users/ben').get()).get('activeGameId')).toBeNull();
  });

  it('only the host starts, and needs 2+ players', async () => {
    const [ana, ben] = [await makePlayer('Ana'), await makePlayer('Ben')];
    const { gameId } = await createTableHandler(call(ana, { maxSeats: 4, requestedMode: 'casual' }));
    expect(await reasonOf(startGameHandler(call(ana, { gameId })))).toBe('NOT_ENOUGH_PLAYERS');
    await joinTableHandler(call(ben, { gameId }));
    expect(await reasonOf(startGameHandler(call(ben, { gameId })))).toBe('NOT_HOST');
  });

  it('starts a casual game: hidden hands, private state, events and deadlines', async () => {
    const players = [await makePlayer('Ana'), await makePlayer('Ben')];
    const before = Date.now();
    const { gameId, mode } = await startedGame(players);
    expect(mode).toBe('casual');
    const game = await readGame(gameId);
    expect(game).toMatchObject({ status: 'in_progress', mode: 'casual', version: 1, turnMs: 30_000 });
    expect(game.handCounts.ana).toBeGreaterThanOrEqual(7);
    for (const hidden of ['drawPile', 'discardPile', 'hands', 'rngState', 'stats', 'recentMoveIds']) {
      expect(game).not.toHaveProperty(hidden);
    }
    expect(game.drawPileCount).toBeGreaterThan(0);
    const deadline = game.turnDeadline.toMillis() - before;
    expect(deadline).toBeGreaterThan(31_000);
    expect(deadline).toBeLessThan(35_000);
    expect(game.finalLapAt.toMillis() - before).toBeGreaterThan(19 * 60_000);
    const events = await db.collection(`games/${gameId}/events`).get();
    expect(events.docs[0]!.id).toBe('000001');
    expect(events.docs[0]!.get('type')).toBe('game_started');
    expect(game.lastEventSeq).toBe(events.size);
  });

  it('ranked needs 3+ players inside the qualifier window', async () => {
    const trio = [await makePlayer('Ana'), await makePlayer('Ben'), await makePlayer('Cal')];
    expect((await startedGame(trio.slice(0, 3), 'ranked')).mode).toBe('casual'); // window closed
    await resetEmulators();
    await openQualifiers();
    const again = [await makePlayer('Ana'), await makePlayer('Ben'), await makePlayer('Cal')];
    expect((await startedGame(again.slice(0, 2), 'ranked')).mode).toBe('casual'); // only 2
  });

  it('ranked with 3+ in the window; anti-collusion downgrades the 3rd same-group game today', async () => {
    await openQualifiers();
    const trio = [await makePlayer('Ana'), await makePlayer('Ben'), await makePlayer('Cal')];
    const first = await startedGame(trio, 'ranked');
    expect(first.mode).toBe('ranked');
    for (const id of ['r1', 'r2']) {
      await db.doc(`results/${id}`).set({
        seasonId: 'connections-2026',
        mode: 'ranked',
        groupKey: 'ana_ben_cal',
        finishedAt: new Date(),
        voided: false,
      });
    }
    await db.doc(`games/${first.gameId}`).update({ status: 'finished' });
    for (const u of ['ana', 'ben', 'cal']) await db.doc(`users/${u}`).update({ activeGameId: null });
    const gameId = await tableWith(trio, 'ranked');
    expect((await readGame(gameId)).collusionWarning).toBe(true);
    expect((await startGameHandler(call(trio[0]!, { gameId }))).mode).toBe('casual');
  });

  it('quick match fills one table and auto-starts it at 4', async () => {
    await openQualifiers();
    const four = [await makePlayer('Ana'), await makePlayer('Ben'), await makePlayer('Cal'), await makePlayer('Dee')];
    const ids = [];
    for (const p of four) ids.push((await quickMatchHandler(call(p, {}))).gameId);
    expect(new Set(ids).size).toBe(1);
    expect(await readGame(ids[0]!)).toMatchObject({ status: 'in_progress', mode: 'ranked', autoStart: true });
  });
});

describe('moves', () => {
  it('plays a legal card, dedupes retries and rejects stale or illegal moves', async () => {
    const players = [await makePlayer('Ana'), await makePlayer('Ben')];
    const byUid = { ana: players[0]!, ben: players[1]! };
    const { gameId } = await startedGame(players);
    let state = await readState(gameId);
    // Resolve an opening Wild color choice first, if dealt one.
    if (state.phase === 'awaiting_color') {
      await send(gameId, { type: 'chooseColor', uid: state.players[state.turn]!, color: 'red' }, byUid);
      state = await readState(gameId);
    }
    const turnUid = state.players[state.turn]!;
    const other = state.players.find((p) => p !== turnUid)!;
    const legal = legalActions(state, turnUid);

    expect(
      await reasonOf(drawCardHandler(call(byUid[other as 'ana'], move(gameId, state.version)))),
    ).toBe('NOT_YOUR_TURN');
    expect(await reasonOf(drawCardHandler(call(byUid[turnUid as 'ana'], move(gameId, state.version - 1))))).toBe(
      'STALE_STATE',
    );
    const illegal = state.hands[turnUid]!.find((c) => !legal.playableCardIds.includes(c.id));
    if (illegal) {
      const err = await playCardHandler(
        call(byUid[turnUid as 'ana'], { ...move(gameId, state.version), cardId: illegal.id, chosenColor: 'red' }),
      ).catch((e) => e);
      expect(err.details.reason).toMatch(/ILLEGAL_CARD|ILLEGAL_WILD_DRAW_FOUR/);
      expect(err.details.hint).toBeTruthy();
    }

    const first = { ...move(gameId, state.version) };
    const res = await drawCardHandler(call(byUid[turnUid as 'ana'], first));
    expect(res.version).toBe(state.version + 1);
    const retry = await drawCardHandler(call(byUid[turnUid as 'ana'], first));
    expect(retry).toEqual({ ok: true, version: res.version, duplicate: true });
    expect((await readGame(gameId)).version).toBe(res.version);
  });

  it('rejects outsiders and paused games', async () => {
    const players = [await makePlayer('Ana'), await makePlayer('Ben')];
    const zed = await makePlayer('Zed');
    const { gameId } = await startedGame(players);
    const v = (await readGame(gameId)).version;
    expect(await reasonOf(drawCardHandler(call(zed, move(gameId, v))))).toBe('NOT_SEATED');
    await db.doc(`games/${gameId}`).update({ paused: true });
    expect(await reasonOf(drawCardHandler(call(players[0]!, move(gameId, v))))).toBe('PAUSED');
  });

  it('claimTimeout waits for the deadline, then acts for the idle player', async () => {
    const players = [await makePlayer('Ana'), await makePlayer('Ben'), await makePlayer('Cal')];
    const zed = await makePlayer('Zed'); // any signed-in player may claim
    const { gameId } = await startedGame(players);
    const before = await readGame(gameId);
    const claim = () => claimTimeoutHandler(call(zed, { gameId, expectedVersion: before.version }));
    expect(await reasonOf(claim())).toBe('DEADLINE_NOT_REACHED');
    setClockOffset(40_000);
    await claim();
    const after = await readState(gameId);
    expect(after.consecutiveTimeouts[before.turnUid ?? after.players[0]!] ?? 0).toBeGreaterThanOrEqual(0);
    const events = await db.collection(`games/${gameId}/events`).where('type', '==', 'timeout').get();
    expect(events.size).toBe(1);
    expect(await reasonOf(claim())).toBe('STALE_STATE'); // duplicate claims are harmless
  });

  it('starts the Final Lap once the cap has passed', async () => {
    const players = [await makePlayer('Ana'), await makePlayer('Ben')];
    const byUid = { ana: players[0]!, ben: players[1]! };
    const { gameId } = await startedGame(players);
    setClockOffset(21 * 60_000);
    const state = await readState(gameId);
    const uid = state.players[state.turn]!;
    const action: Action = state.phase === 'awaiting_color' ? { type: 'chooseColor', uid, color: 'red' } : { type: 'draw', uid };
    await send(gameId, action, byUid);
    const game = await readGame(gameId);
    expect(game.finalLap.active).toBe(true);
    expect((await db.collection(`games/${gameId}/events`).where('type', '==', 'final_lap').get()).size).toBe(1);
  });

  it('leaving forfeits; the last player standing wins and everyone is freed', async () => {
    const players = [await makePlayer('Ana'), await makePlayer('Ben')];
    const { gameId } = await startedGame(players);
    const v = (await readGame(gameId)).version;
    await leaveGameHandler(call(players[1]!, move(gameId, v)));
    const game = await readGame(gameId);
    expect(game).toMatchObject({ status: 'finished', endedBy: 'last_player_standing', placements: ['ana', 'ben'] });
    const result = (await db.doc(`results/${gameId}`).get()).data()!;
    expect(result).toMatchObject({ mode: 'casual', tableSize: 2, groupKey: 'ana_ben' });
    expect(result.placements.map((p: { points: number }) => p.points)).toEqual([0, 0]);
    for (const u of ['ana', 'ben']) expect((await db.doc(`users/${u}`).get()).get('activeGameId')).toBeNull();
  });

  it('plays a whole ranked game end-to-end with bots driving real callables', async () => {
    await openQualifiers();
    const players = [await makePlayer('Ana'), await makePlayer('Ben'), await makePlayer('Cal')];
    const byUid = { ana: players[0]!, ben: players[1]!, cal: players[2]! };
    const { gameId, mode } = await startedGame(players, 'ranked');
    expect(mode).toBe('ranked');
    const random = createRandom(2026);

    for (let i = 0; i < 400; i++) {
      if (i === 150) setClockOffset(21 * 60_000); // guarantee an ending via the Final Lap
      const state = await readState(gameId);
      if (state.phase === 'finished') break;
      const action =
        state.players.map((uid) => botAction(state, uid, random)).find((a) => a?.type === 'catchUno') ??
        botAction(state, state.players[state.turn]!, random)!;
      await send(gameId, action, byUid);
    }

    const game = await readGame(gameId);
    expect(game.status).toBe('finished');
    const result = (await db.doc(`results/${gameId}`).get()).data()!;
    expect(result.mode).toBe('ranked');
    expect(result.placements).toHaveLength(3);
    const counts = result.turnCount >= 12;
    expect(result.placements.map((p: { points: number }) => p.points)).toEqual([8, 4, 1]);
    expect(result.placements.every((p: { counts: boolean }) => p.counts === counts)).toBe(true);
    expect(result.placements[0].stats.cardsPlayed).toBeGreaterThan(0);
    for (const u of ['ana', 'ben', 'cal']) expect((await db.doc(`users/${u}`).get()).get('activeGameId')).toBeNull();
  }, 120_000);
});

describe('roster and approval', () => {
  it('importRoster activates pending users on the roster; approveUser handles the rest', async () => {
    await db.doc('config/app').set({ rosterRequired: true });
    const admin = await makeUser('boss', 'boss@nuesynergy.com', { active: true, admin: true });
    const dana = await makeUser('dana', 'dana@nuesynergy.com');
    const box = await makeUser('box', 'info@nuesynergy.com');
    await saveProfileHandler(call(dana, { displayName: 'Dana', avatarId: 'fox', attendingEvent: 'yes' }));
    await saveProfileHandler(call(box, { displayName: 'Info Box', avatarId: 'owl', attendingEvent: 'no' }));
    expect((await db.doc('users/dana').get()).get('status')).toBe('pending');

    expect(await reasonOf(importRosterHandler(call(dana, { rows: [] })))).toBe('PENDING_APPROVAL');
    const res = await importRosterHandler(
      call(admin, { rows: [{ email: 'Dana@NueSynergy.com', name: 'Dana', department: 'Finance' }] }),
    );
    expect(res).toMatchObject({ imported: 1, activated: 1 });
    expect((await db.doc('users/dana').get()).get('status')).toBe('active');
    expect((await db.doc('roster/dana@nuesynergy.com').get()).get('department')).toBe('Finance');

    await approveUserHandler(call(admin, { uid: 'box' }));
    expect((await db.doc('users/box').get()).get('status')).toBe('active');
    expect((await db.collection('auditLog').get()).size).toBe(2);
  });
});

describe('cleanup and time', () => {
  it('abandons idle lobbies and frees their players', async () => {
    const ana = await makePlayer('Ana');
    const { gameId } = await createTableHandler(call(ana, { maxSeats: 4, requestedMode: 'casual' }));
    await db.doc(`games/${gameId}`).update({ updatedAt: new Date(Date.now() - 31 * 60_000) });
    expect(await cleanupStaleGames()).toEqual({ abandoned: 1 });
    expect((await readGame(gameId)).status).toBe('abandoned');
    expect((await db.doc('users/ana').get()).get('activeGameId')).toBeNull();
  });

  it('computes local midnight in Chicago across DST', () => {
    // 2026-07-15 15:00 UTC = 10:00 CDT → midnight CDT = 05:00 UTC
    expect(new Date(startOfDayMs(Date.UTC(2026, 6, 15, 15), 'America/Chicago')).toISOString()).toBe(
      '2026-07-15T05:00:00.000Z',
    );
    // 2026-12-01 03:00 UTC = Nov 30 21:00 CST → midnight CST Nov 30 = 06:00 UTC
    expect(new Date(startOfDayMs(Date.UTC(2026, 11, 1, 3), 'America/Chicago')).toISOString()).toBe(
      '2026-11-30T06:00:00.000Z',
    );
  });
});
