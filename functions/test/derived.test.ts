import { getDatabase } from 'firebase-admin/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/admin.js';
import {
  onLeaderboardEntryWrittenHandler,
  onResultWrittenHandler,
  onUserWrittenHandler,
  recomputePlayer,
} from '../src/derived/recompute.js';
import { joinTableHandler, createTableHandler } from '../src/game/lobby.js';
import { markInboxSeenHandler } from '../src/social/nudges.js';
import { teamsDigest, unoHourAnnouncer } from '../src/social/schedules.js';
import { adaptiveCard, postToTeams } from '../src/teams.js';
import { call, makePlayer, openQualifiers, resetEmulators, setClockOffset } from './helpers.js';

const SEASON = 'connections-2026';

beforeEach(async () => {
  await resetEmulators();
  await getDatabase().ref('/').set(null);
});

let seq = 0;
async function writeResult(order: string[], opts: { mode?: string; turns?: number; voided?: boolean; depts?: Record<string, string> } = {}) {
  seq++;
  const pts = order.length === 4 ? [10, 6, 3, 1] : [8, 4, 1];
  const mode = opts.mode ?? 'ranked';
  const turns = opts.turns ?? 20;
  const doc = {
    seasonId: SEASON,
    mode,
    tableSize: order.length,
    turnCount: turns,
    playerUids: order,
    groupKey: [...order].sort().join('_'),
    finishedAt: new Date(Date.now() - (100 - seq) * 60_000),
    voided: !!opts.voided,
    placements: order.map((uid, i) => ({
      uid,
      department: opts.depts?.[uid] ?? null,
      place: i + 1,
      points: mode === 'ranked' ? pts[i] : 0,
      counts: mode === 'ranked' && turns >= 12,
      cardsLeft: i,
      handValue: i * 3,
      forfeited: false,
      stats: { cardsPlayed: 4, cardsPlayedByValue: { wild4: 1 }, wild4Played: 1, draw2Played: 0, cardsDrawn: 2, unoCalls: 1, catches: 0, timesCaught: 0, timeouts: 0, maxHandSize: 8, wild4Victims: {} },
    })),
  };
  const ref = db.collection('results').doc(`r${seq}`);
  await ref.set(doc);
  return { ref, doc };
}

describe('derived data triggers', () => {
  it('builds leaderboard, Passport, stats and firstGameAt from results', async () => {
    await makePlayer('Ana', { department: 'Finance' });
    await makePlayer('Ben', { department: 'IT' });
    await makePlayer('Cal', { department: 'Sales' });
    const depts = { ana: 'Finance', ben: 'IT', cal: 'Sales' };
    for (const order of [['ana', 'ben', 'cal'], ['ben', 'ana', 'cal'], ['ana', 'cal', 'ben']]) {
      const { doc } = await writeResult(order, { depts });
      await onResultWrittenHandler(undefined, doc);
    }
    const { doc: casual } = await writeResult(['ana', 'ben'], { mode: 'casual', depts });
    await onResultWrittenHandler(undefined, casual);

    const ana = (await db.doc(`leaderboard/${SEASON}/entries/ana`).get()).data()!;
    expect(ana).toMatchObject({ displayName: 'Ana', department: 'Finance', score: 20, rankedGames: 3, wins: 2, eligible: true });
    const passport = (await db.doc('passport/ana').get()).data()!;
    expect(passport).toMatchObject({ distinctCoworkers: 2, crossDeptPairs: 2 });
    expect(passport.opponents.ben.games).toBe(4);
    const stats = (await db.doc(`playerStats/${SEASON}_ana`).get()).data()!;
    expect(stats).toMatchObject({ games: 4, wins: 3, wild4Played: 4 });
    expect((await db.doc('users/ana').get()).get('firstGameAt')).toBeTruthy();
  });

  it('a void removes the game everywhere; casual-only players get no leaderboard row', async () => {
    await makePlayer('Ana');
    await makePlayer('Ben');
    await makePlayer('Cal');
    const { ref, doc } = await writeResult(['ana', 'ben', 'cal']);
    await onResultWrittenHandler(undefined, doc);
    expect((await db.doc(`leaderboard/${SEASON}/entries/cal`).get()).get('score')).toBe(1);
    const voided = { ...doc, voided: true };
    await ref.set(voided);
    await onResultWrittenHandler(doc, voided);
    expect((await db.doc(`leaderboard/${SEASON}/entries/cal`).get()).data()).toMatchObject({ score: 0, rankedGames: 0 });

    await makePlayer('Dee');
    const { doc: casual } = await writeResult(['dee', 'ana'], { mode: 'casual' });
    await onResultWrittenHandler(undefined, casual);
    expect((await db.doc(`leaderboard/${SEASON}/entries/dee`).get()).exists).toBe(false);
    expect((await db.doc('passport/dee').get()).get('distinctCoworkers')).toBe(1);
  });

  it('recomputes the Department Cup and tracks the leader', async () => {
    await db.doc('config/app').set({ departments: ['Finance', 'IT/Ops'] });
    for (const [name, dept] of [['Ana', 'Finance'], ['Ben', 'Finance'], ['Cal', 'IT/Ops']] as const) {
      await makePlayer(name, { department: dept });
    }
    const depts = { ana: 'Finance', ben: 'Finance', cal: 'IT/Ops' };
    for (let i = 0; i < 3; i++) {
      const { doc } = await writeResult(['ana', 'ben', 'cal'], { depts });
      await onResultWrittenHandler(undefined, doc);
    }
    for (const uid of ['ana', 'ben', 'cal']) {
      await onLeaderboardEntryWrittenHandler(SEASON, undefined, (await db.doc(`leaderboard/${SEASON}/entries/${uid}`).get()).data());
    }
    const finance = (await db.doc(`departmentCup/${SEASON}/entries/Finance`).get()).data()!;
    // ana 24 + ben 12 (top 3 of 2 members) + 2 participants × 2 = 40
    expect(finance).toMatchObject({ cupScore: 40, participants: 2, memberCount: 2 });
    expect((await db.doc(`departmentCup/${SEASON}/entries/${encodeURIComponent('IT/Ops')}`).get()).get('cupScore')).toBe(5);
    expect((await db.doc(`seasons/${SEASON}/state/leader`).get()).get('uid')).toBe('ana');
  });

  it('keeps the leaderboard copy of a profile fresh', async () => {
    await makePlayer('Ana');
    const { doc } = await writeResult(['ana', 'ben', 'cal']);
    await onResultWrittenHandler(undefined, doc);
    await db.doc('users/ana').update({ displayName: 'Ana B', department: 'Sales' });
    await onUserWrittenHandler('ana', (await db.doc('users/ana').get()).data());
    expect((await db.doc(`leaderboard/${SEASON}/entries/ana`).get()).data()).toMatchObject({ displayName: 'Ana B', department: 'Sales' });
  });

  it('recomputePlayer is idempotent', async () => {
    await makePlayer('Ana');
    const { doc } = await writeResult(['ana', 'ben', 'cal']);
    await onResultWrittenHandler(undefined, doc);
    const first = (await db.doc(`leaderboard/${SEASON}/entries/ana`).get()).data()!;
    await recomputePlayer('ana', SEASON);
    const second = (await db.doc(`leaderboard/${SEASON}/entries/ana`).get()).data()!;
    expect({ ...second, updatedAt: null }).toEqual({ ...first, updatedAt: null });
  });
});

describe('table-forming nudges', () => {
  it('notifies online lobby players once when a ranked table needs one more', async () => {
    await openQualifiers();
    const [ana, ben] = [await makePlayer('Ana'), await makePlayer('Ben')];
    await makePlayer('Cal');
    await makePlayer('Dee');
    await getDatabase().ref('status').set({
      cal: { state: 'online', activity: 'lobby', at: Date.now() },
      dee: { state: 'online', activity: 'game', at: Date.now() },
      zed: { state: 'offline', at: Date.now() },
    });
    const { gameId } = await createTableHandler(call(ana, { maxSeats: 3, requestedMode: 'ranked' }));
    await joinTableHandler(call(ben, { gameId }));

    const items = await db.collection('inbox/cal/items').get();
    expect(items.size).toBe(1);
    expect(items.docs[0]!.data()).toMatchObject({ type: 'table_forming', link: `/t/${gameId}`, seenAt: null });
    expect((await db.collection('inbox/dee/items').get()).size).toBe(0); // busy in a game

    // Rate limit: another forming table right away doesn't nudge Cal again.
    const eve = await makePlayer('Eve');
    const fay = await makePlayer('Fay');
    const second = await createTableHandler(call(eve, { maxSeats: 3, requestedMode: 'ranked' }));
    await joinTableHandler(call(fay, { gameId: second.gameId }));
    expect((await db.collection('inbox/cal/items').get()).size).toBe(1);

    const calCtx = { auth: { uid: 'cal', token: { email: 'cal@nuesynergy.com', email_verified: true, active: true } as never, rawToken: '' } };
    await markInboxSeenHandler({ ...calCtx, data: { itemIds: [items.docs[0]!.id] } });
    expect((await db.doc(`inbox/cal/items/${items.docs[0]!.id}`).get()).get('seenAt')).toBeTruthy();
  });
});

describe('Teams + Uno Hours', () => {
  it('builds adaptive cards and skips posting when unconfigured', async () => {
    const card = adaptiveCard('Title', [{ text: 'hello', bold: true }], { title: 'Go', url: 'https://x' });
    expect(card.attachments[0]!.content.body[1]).toMatchObject({ text: 'hello', weight: 'Bolder' });
    expect(await postToTeams('digest', card, 'unset')).toBe('unconfigured');
    await db.doc('config/app').set({ teams: { digest: false } });
    expect(await postToTeams('digest', card, 'https://example.invalid/hook')).toBe('disabled');
  });

  it('digest and announcer only run while qualifying; announcer raises a banner once per slot', async () => {
    expect(await teamsDigest()).toBe('skipped (not qualifying)');
    await openQualifiers();
    expect(await teamsDigest()).toBe('unconfigured');

    // Jump to the next weekday 12:02 Chicago time.
    const now = new Date();
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 17, 2));
    while ([0, 6].includes(new Date(target.getTime() - 5 * 3_600_000).getUTCDay())) target.setUTCDate(target.getUTCDate() + 1);
    // 17:02 UTC is 12:02 CDT / 11:02 CST — nudge into the slot either way.
    const inDst = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'short' }).format(target).includes('CDT');
    if (!inDst) target.setUTCHours(18);
    setClockOffset(target.getTime() - Date.now());
    expect(await unoHourAnnouncer()).toBe('unconfigured');
    expect(await unoHourAnnouncer()).toBe('already announced');
    const banners = await db.collection('announcements').get();
    expect(banners.size).toBe(1);
    expect(banners.docs[0]!.get('text')).toMatch(/Uno Hour is live/);
  });
});
