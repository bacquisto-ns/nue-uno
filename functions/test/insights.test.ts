import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/admin.js';
import { adminRouter } from '../src/event/adminRouter.js';
import { call, makePlayer, makeUser, reasonOf, resetEmulators } from './helpers.js';

const SEASON = 'connections-2026';
beforeEach(resetEmulators);

const stats = (uid: string, over: Record<string, number>) =>
  db.doc(`playerStats/${SEASON}_${uid}`).set({ games: 5, humanGames: 5, wins: 1, wild4Played: 0, catches: 0, maxCardsHeldInWin: 0, ...over });

describe('awards + stats admin actions', () => {
  it('computeAwards writes awards/{season} from stats, Passports, Cup, Pick\'em and the champion', async () => {
    const boss = await makeUser('boss', 'boss@nuesynergy.com', { active: true, admin: true });
    const ana = await makePlayer('Ana');
    await makePlayer('Ben');
    await stats('ana', { wild4Played: 6, catches: 1 });
    await stats('ben', { wild4Played: 2, catches: 4, maxCardsHeldInWin: 12, humanGames: 9 });
    await stats('other', { wild4Played: 50, humanGames: 2 }); // too few games, and another season's docs are ignored
    await db.doc(`playerStats/old-season_ana`).set({ humanGames: 99, wild4Played: 99 });
    await db.doc('passport/ana').set({ distinctCoworkers: 7, crossDeptPairs: 3 });
    await db.doc('passport/ben').set({ distinctCoworkers: 3, crossDeptPairs: 3 });
    await db.doc(`departmentCup/${SEASON}/entries/Finance`).set({ department: 'Finance', cupScore: 120 });
    await db.doc(`seasons/${SEASON}`).set({ activeBracketId: 'b1' }, { merge: true });
    await db.doc('brackets/b1').set({ championUid: 'ben' });
    await db.doc('pickem/b1/entries/ana').set({ displayName: 'Ana', points: 13 });

    expect(await reasonOf(adminRouter(call(ana, { action: 'computeAwards', payload: {} })))).toBe('NOT_ADMIN');
    expect(await adminRouter(call(boss, { action: 'computeAwards', payload: {} }))).toEqual({ ok: true, count: 8 });

    const items = (await db.doc(`awards/${SEASON}`).get()).get('items') as { key: string; winners: { displayName: string }[]; statLine: string }[];
    const by = Object.fromEntries(items.map((a) => [a.key, a]));
    expect(items.at(-1)!.key).toBe('champion');
    expect(by.champion!.winners[0]!.displayName).toBe('Ben');
    expect(by.draw4!.winners[0]!.displayName).toBe('Ana');
    expect(by.draw4!.statLine).toBe('6 Wild Draw 4s played');
    expect(by.connector!.winners[0]!.displayName).toBe('Ana');
    expect(by.sharpshooter!.winners[0]!.displayName).toBe('Ben');
    expect(by.cup!.winners[0]!.displayName).toBe('Finance');
    expect(by.oracle!.statLine).toBe("13 Pick'em points");
  });

  it('adminStats returns the §13 metrics', async () => {
    const boss = await makeUser('boss', 'boss@nuesynergy.com', { active: true, admin: true });
    await makePlayer('Ana');
    await makePlayer('Ben');
    await db.doc('roster/ana@nuesynergy.com').set({ name: 'Ana' });
    await db.collection('results').add({ seasonId: SEASON, mode: 'ranked', voided: false, playerUids: ['ana', 'ben'], finishedAt: new Date() });
    await db.collection('auditLog').add({ action: 'voidGame' });

    const res = (await adminRouter(call(boss, { action: 'adminStats', payload: {} }))) as { metrics: { key: string; value: string }[]; daily: unknown[] };
    const m = Object.fromEntries(res.metrics.map((x) => [x.key, x.value]));
    expect(m.registered).toBe('2 / 1 (200%)');
    expect(m.rankedGames).toBe('1');
    expect(m.rankedPlayers).toBe('2 (100% of registered)');
    expect(m.overrides).toBe('1');
    expect(res.daily).toHaveLength(1);
  });
});
