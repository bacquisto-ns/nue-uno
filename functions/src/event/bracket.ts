import {
  compareEntries,
  generateBracket,
  matchOutcome,
  pickemScore,
  resolveSlots,
  type BracketPlan,
  type MatchGameResult,
  type SlotSource,
} from '@nue-uno/shared';
import { FieldValue, Timestamp, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from '../admin.js';
import { fail } from '../errors.js';
import type { GameDoc, Seat } from '../game/model.js';
import { planStart, startInTx } from '../game/start.js';
import { getSeason } from '../season.js';
import { adaptiveCard, appUrl, postToTeams } from '../teams.js';

export type MatchStatus = 'waiting_for_players' | 'ready' | 'in_progress' | 'complete';

export interface MatchDoc {
  round: number;
  roundName: string;
  table: string;
  physicalTable: number;
  sources: SlotSource[];
  slots: (string | null)[];
  status: MatchStatus;
  checkedIn: string[];
  gamesToPlay: number;
  gameIds: string[];
  currentGameId: string | null;
  standings: { uid: string; points: number; wins: number; lastPlace: number }[];
  advancing: string[];
  override: { placements: string[]; by: string; reason: string; at: Timestamp } | null;
}

export interface BracketDoc {
  seasonId: string;
  status: 'draft' | 'locked' | 'in_progress' | 'complete';
  size: number;
  seeds: { seed: number; uid: string; displayName: string; score: number }[];
  rounds: BracketPlan['rounds'];
  finalGames: number;
  championUid: string | null;
  createdBy: string;
}

const bracketRef = (id: string) => db.doc(`brackets/${id}`);
const matchesCol = (id: string) => db.collection(`brackets/${id}/matches`);

function planFrom(bracket: BracketDoc, matches: Record<string, MatchDoc>): BracketPlan {
  return {
    rounds: bracket.rounds,
    matches: Object.entries(matches).map(([matchId, m]) => ({
      matchId,
      round: m.round,
      table: m.table,
      slots: m.sources,
      gamesToPlay: m.gamesToPlay,
      physicalTable: m.physicalTable,
    })),
  };
}

// ---- Generate / edit / lock (admin) ---------------------------------------------------------

/** Top N eligible, attending players in leaderboard order (tournament.md §2). */
async function seedCandidates(seasonId: string, exclude: string[]) {
  const snap = await db.collection(`leaderboard/${seasonId}/entries`).get();
  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as { displayName: string; score: number; winRate: number; avgPlace: number; eligible: boolean; attendingEvent: string }), scoreReachedAtMs: d.get('scoreReachedAt')?.toMillis?.() ?? null }))
    .filter((e) => e.eligible && e.attendingEvent === 'yes' && !exclude.includes(e.uid))
    .sort(compareEntries);
}

function matchDocsFor(plan: BracketPlan, seedUids: string[], physical?: Record<string, number>): Record<string, MatchDoc> {
  const slots = resolveSlots(plan, seedUids, {});
  const roundName = Object.fromEntries(plan.rounds.map((r) => [r.number, r.name]));
  return Object.fromEntries(
    plan.matches.map((m) => [
      m.matchId,
      {
        round: m.round,
        roundName: roundName[m.round] ?? `Round ${m.round}`,
        table: m.table,
        physicalTable: physical?.[m.matchId] ?? m.physicalTable,
        sources: m.slots,
        slots: slots[m.matchId]!,
        status: 'waiting_for_players',
        checkedIn: [],
        gamesToPlay: m.gamesToPlay,
        gameIds: [],
        currentGameId: null,
        standings: [],
        advancing: [],
        override: null,
      } satisfies MatchDoc,
    ]),
  );
}

async function writeMatches(bracketId: string, matches: Record<string, MatchDoc>, replace: boolean) {
  const batch = db.batch();
  if (replace) for (const d of (await matchesCol(bracketId).get()).docs) batch.delete(d.ref);
  for (const [id, m] of Object.entries(matches)) batch.set(matchesCol(bracketId).doc(id), m);
  await batch.commit();
}

export async function generateBracketFor(
  actorUid: string,
  opts: { size?: number; excludeUids?: string[] },
): Promise<{ bracketId: string; size: number }> {
  const season = await getSeason({ fresh: true });
  const seasonDoc = (await db.doc(`seasons/${season.id}`).get()).data() ?? {};
  const existingId: string | undefined = seasonDoc.activeBracketId;
  if (existingId) {
    const existing = (await bracketRef(existingId).get()).data() as BracketDoc | undefined;
    if (existing && existing.status !== 'draft') {
      throw fail('failed-precondition', 'BRACKET_LOCKED', 'The bracket is locked — use overrides instead.');
    }
  }
  const candidates = await seedCandidates(season.id, opts.excludeUids ?? []);
  const wanted = opts.size ?? seasonDoc.bracketSize ?? 16;
  const size = Math.min(wanted, candidates.length);
  if (size < 3) throw fail('failed-precondition', 'NOT_ENOUGH_PLAYERS', 'At least 3 eligible, attending players are needed.');
  const finalGames = seasonDoc.finalGames ?? 3;
  const plan = generateBracket(size, finalGames);
  const seeds = candidates.slice(0, size).map((c, i) => ({ seed: i + 1, uid: c.uid, displayName: c.displayName, score: c.score }));

  const bracketId = existingId ?? db.collection('brackets').doc().id;
  const bracket: BracketDoc = { seasonId: season.id, status: 'draft', size, seeds, rounds: plan.rounds, finalGames, championUid: null, createdBy: actorUid };
  await bracketRef(bracketId).set({ ...bracket, createdAt: FieldValue.serverTimestamp(), lockedAt: null, completedAt: null });
  await writeMatches(bracketId, matchDocsFor(plan, seeds.map((s) => s.uid)), true);
  await db.doc(`seasons/${season.id}`).set({ activeBracketId: bracketId }, { merge: true });
  return { bracketId, size };
}

async function loadBracket(bracketId: string) {
  const [b, ms] = await Promise.all([bracketRef(bracketId).get(), matchesCol(bracketId).get()]);
  if (!b.exists) throw fail('not-found', 'MATCH_NOT_FOUND', 'No such bracket.');
  const matches = Object.fromEntries(ms.docs.map((d) => [d.id, d.data() as MatchDoc]));
  return { bracket: b.data() as BracketDoc, matches };
}

export async function editBracketSeeds(bracketId: string, seeds: { seed: number; uid: string }[]) {
  const { bracket, matches } = await loadBracket(bracketId);
  if (bracket.status !== 'draft') throw fail('failed-precondition', 'BRACKET_LOCKED', 'Only a draft bracket can be reseeded.');
  const bySeed = new Map(seeds.map((s) => [s.seed, s.uid]));
  const next = bracket.seeds.map((s) => ({ ...s, uid: bySeed.get(s.seed) ?? s.uid }));
  if (new Set(next.map((s) => s.uid)).size !== next.length) throw fail('invalid-argument', 'BAD_REQUEST', 'Each player can only hold one seed.');
  const users = await Promise.all(next.map((s) => db.doc(`users/${s.uid}`).get()));
  const withNames = next.map((s, i) => ({ ...s, displayName: users[i]!.get('displayName') ?? s.displayName }));
  const physical = Object.fromEntries(Object.entries(matches).map(([id, m]) => [id, m.physicalTable]));
  await bracketRef(bracketId).set({ seeds: withNames }, { merge: true });
  await writeMatches(bracketId, matchDocsFor(planFrom(bracket, matches), withNames.map((s) => s.uid), physical), true);
}

export async function setPhysicalTables(bracketId: string, map: Record<string, number>) {
  const batch = db.batch();
  for (const [matchId, n] of Object.entries(map)) batch.set(matchesCol(bracketId).doc(matchId), { physicalTable: n }, { merge: true });
  await batch.commit();
}

export async function lockBracket(bracketId: string) {
  const { bracket } = await loadBracket(bracketId);
  if (bracket.status !== 'draft') throw fail('failed-precondition', 'BRACKET_LOCKED', 'Already locked.');
  await bracketRef(bracketId).set({ status: 'locked', lockedAt: FieldValue.serverTimestamp() }, { merge: true });
  const seasonRef = db.doc(`seasons/${bracket.seasonId}`);
  if ((await seasonRef.get()).get('status') === 'qualifying') await seasonRef.set({ status: 'locked' }, { merge: true });
  await recomputeBracket(bracketId);
}

// ---- Starting games -------------------------------------------------------------------------

async function seatsFor(uids: string[]): Promise<Seat[]> {
  const snaps = await Promise.all(uids.map((u) => db.doc(`users/${u}`).get()));
  return snaps.map((s, i) => ({
    uid: uids[i]!,
    displayName: s.get('displayName') ?? 'Player',
    avatarId: s.get('avatarId') ?? 'fox',
    avatarColor: s.get('avatarColor') ?? 'teal',
    department: s.get('department') ?? null,
  }));
}

/** Create and deal the next game for a match with its fixed seats (no lobby). */
export async function startMatchGame(bracketId: string, matchId: string, opts: { force?: boolean } = {}): Promise<string> {
  const season = await getSeason();
  const matchRef = matchesCol(bracketId).doc(matchId);
  const pre = (await matchRef.get()).data() as MatchDoc | undefined;
  if (!pre) throw fail('not-found', 'MATCH_NOT_FOUND', 'No such match.');
  const uids = pre.slots.filter((u): u is string => !!u);
  const seats = await seatsFor(uids);
  const gameRef = db.collection('games').doc();

  await db.runTransaction(async (tx: Transaction) => {
    const m = (await tx.get(matchRef)).data() as MatchDoc;
    if (m.status === 'complete') throw fail('failed-precondition', 'BAD_REQUEST', 'This match is already complete.');
    if (m.currentGameId) {
      const cur = await tx.get(db.doc(`games/${m.currentGameId}`));
      if (cur.get('status') === 'in_progress') throw fail('failed-precondition', 'BAD_REQUEST', 'A game is already running at this table.');
    }
    if (m.slots.some((s) => !s)) throw fail('failed-precondition', 'PLAYERS_NOT_PRESENT', 'Not every seat is filled yet.');
    if (!opts.force && m.gameIds.length === 0 && !uids.every((u) => m.checkedIn.includes(u))) {
      throw fail('failed-precondition', 'PLAYERS_NOT_PRESENT', 'Waiting for everyone to check in.');
    }
    const meta = {
      seasonId: season.id,
      status: 'lobby',
      requestedMode: 'casual',
      mode: 'bracket',
      hostUid: uids[0],
      seats,
      seatUids: uids,
      maxSeats: uids.length,
      autoStart: false,
      collusionWarning: false,
      bracketId,
      matchId,
      matchGameNumber: m.gameIds.length + 1,
      physicalTable: m.physicalTable,
      turnMs: null,
      paused: false,
      lastEventSeq: 0,
      version: 0,
      turnDeadline: null,
      finalLapAt: null,
      startedAt: null,
      finishedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(gameRef, meta);
    const plan = await planStart(tx, meta as unknown as GameDoc, uids, season);
    startInTx(tx, { ref: gameRef, game: meta as unknown as GameDoc }, uids, plan, season);
    tx.set(matchRef, { status: 'in_progress', currentGameId: gameRef.id, gameIds: FieldValue.arrayUnion(gameRef.id) }, { merge: true });
    for (const u of uids) tx.set(db.doc(`users/${u}`), { activeGameId: gameRef.id }, { merge: true });
  });
  await bracketRef(bracketId).set({ status: 'in_progress' }, { merge: true });
  return gameRef.id;
}

export async function checkIn(uid: string, bracketId: string, matchId: string): Promise<{ ok: true; gameId?: string }> {
  const matchRef = matchesCol(bracketId).doc(matchId);
  const allIn = await db.runTransaction(async (tx) => {
    const m = (await tx.get(matchRef)).data() as MatchDoc | undefined;
    if (!m) throw fail('not-found', 'MATCH_NOT_FOUND', 'No such match.');
    if (!m.slots.includes(uid)) throw fail('permission-denied', 'NOT_IN_MATCH', "You're not playing at this table.");
    if (m.status !== 'ready') return false;
    const checkedIn = Array.from(new Set([...m.checkedIn, uid]));
    tx.set(matchRef, { checkedIn }, { merge: true });
    return m.slots.every((s) => s && checkedIn.includes(s));
  });
  if (!allIn) {
    const m = (await matchRef.get()).data() as MatchDoc;
    return { ok: true, ...(m.currentGameId ? { gameId: m.currentGameId } : {}) };
  }
  return { ok: true, gameId: await startMatchGame(bracketId, matchId) };
}

/** QR sign at physical table n → the caller's live match there (api.md checkInAtTable). */
export async function checkInAtTable(uid: string, physicalTable: number) {
  const season = await getSeason({ fresh: true });
  const bracketId: string | undefined = (await db.doc(`seasons/${season.id}`).get()).get('activeBracketId');
  if (!bracketId) throw fail('not-found', 'NO_MATCH_AT_TABLE', 'There is no bracket running.');
  const snap = await matchesCol(bracketId).where('physicalTable', '==', physicalTable).get();
  const mine = snap.docs.find((d) => (d.get('slots') as string[]).includes(uid) && ['ready', 'in_progress'].includes(d.get('status')));
  if (!mine) {
    const elsewhere = (await matchesCol(bracketId).get()).docs.find(
      (d) => (d.get('slots') as string[]).includes(uid) && ['ready', 'in_progress', 'waiting_for_players'].includes(d.get('status')),
    );
    const hint = elsewhere ? `You're at table ${elsewhere.get('physicalTable')} (${elsewhere.get('roundName')}).` : "You're not playing right now.";
    throw fail('not-found', 'NO_MATCH_AT_TABLE', "You're not playing at this table right now.", hint);
  }
  const res = await checkIn(uid, bracketId, mine.id);
  return { ...res, matchId: mine.id, bracketId };
}

// ---- Advancement ----------------------------------------------------------------------------

/**
 * Recompute every match from seeds, results and overrides (idempotent — tournament.md §3), fill
 * later slots, start the Final's next game, notify newly-ready tables, score Pick'em.
 */
export async function recomputeBracket(bracketId: string): Promise<void> {
  const { bracket, matches } = await loadBracket(bracketId);
  if (bracket.status === 'draft') return;
  const plan = planFrom(bracket, matches);
  const results = await db.collection('results').where('bracketId', '==', bracketId).get();
  const gamesByMatch: Record<string, MatchGameResult[]> = {};
  for (const r of results.docs) {
    if (r.get('voided')) continue;
    (gamesByMatch[r.get('matchId')] ??= []).push({ placements: r.get('placements'), finishedAtMs: r.get('finishedAt')?.toMillis?.() ?? 0 });
  }
  const liveGames = new Set(
    (await db.collection('games').where('bracketId', '==', bracketId).where('status', '==', 'in_progress').get()).docs.map((d) => d.id),
  );

  const advancing: Record<string, string[]> = {};
  const next: Record<string, Partial<MatchDoc>> = {};
  const ordered = Object.entries(matches).sort((a, b) => a[1].round - b[1].round);
  const seedUids = bracket.seeds.map((s) => s.uid);
  for (const [id, m] of ordered) {
    const slots = resolveSlots(plan, seedUids, advancing)[id]!;
    const uids = slots.filter((s): s is string => !!s);
    const filled = uids.length === slots.length;
    const outcome = filled
      ? matchOutcome(uids, gamesByMatch[id] ?? [], m.gamesToPlay, id === 'FINAL', m.override?.placements)
      : { standings: [], complete: false, advancing: [] };
    if (outcome.complete) advancing[id] = outcome.advancing;
    const status: MatchStatus = outcome.complete
      ? 'complete'
      : !filled
        ? 'waiting_for_players'
        : m.currentGameId && liveGames.has(m.currentGameId)
          ? 'in_progress'
          : 'ready';
    next[id] = { slots, standings: outcome.standings, advancing: outcome.advancing, status };
  }

  const batch = db.batch();
  const newlyReady: string[] = [];
  const newlyComplete: string[] = [];
  for (const [id, n] of Object.entries(next)) {
    const before = matches[id]!;
    if (before.status !== 'ready' && n.status === 'ready' && before.gameIds.length === 0) newlyReady.push(id);
    if (before.status !== 'complete' && n.status === 'complete') newlyComplete.push(id);
    batch.set(matchesCol(bracketId).doc(id), n, { merge: true });
  }
  const championUid = next.FINAL?.status === 'complete' ? (next.FINAL.advancing?.[0] ?? null) : null;
  const allComplete = Object.values(next).every((n) => n.status === 'complete');
  batch.set(
    bracketRef(bracketId),
    { championUid, ...(allComplete ? { status: 'complete', completedAt: FieldValue.serverTimestamp() } : {}) },
    { merge: true },
  );
  await batch.commit();

  // Tables that just became ready: full-screen "your table is ready" takeover (PRD N3).
  for (const id of newlyReady) {
    const m = { ...matches[id]!, ...next[id] } as MatchDoc;
    const inbox = db.batch();
    for (const uid of m.slots.filter((s): s is string => !!s)) {
      inbox.set(db.collection(`inbox/${uid}/items`).doc(), {
        type: 'match_ready',
        title: `${m.roundName} · Table ${m.physicalTable}`,
        body: 'Your table is ready — head over and tap "I\'m here".',
        link: `/table/${m.physicalTable}`,
        takeover: true,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60_000),
        seenAt: null,
      });
    }
    await inbox.commit();
  }

  // The Final plays several games: deal the next one as soon as the previous finishes.
  const final = next.FINAL;
  const finalBefore = matches.FINAL;
  if (final && finalBefore && final.status === 'ready' && finalBefore.gameIds.length > 0) {
    try {
      await startMatchGame(bracketId, 'FINAL', { force: true });
    } catch (err) {
      logger.warn('could not start next Final game', { err: String(err) });
    }
  }

  if (newlyComplete.length) {
    await recomputePickem(bracketId, next, championUid);
    for (const id of newlyComplete) {
      const n = next[id]!;
      const names = await Promise.all((n.advancing ?? []).map(async (u) => (await db.doc(`users/${u}`).get()).get('displayName') ?? 'Player'));
      await postToTeams(
        'matchResults',
        adaptiveCard(
          id === 'FINAL' ? `🏆 ${names[0]} is the Nue Uno champion!` : `✅ ${matches[id]!.roundName} · Table ${matches[id]!.table} done`,
          id === 'FINAL' ? [{ text: 'Congratulations!' }] : [{ text: `Advancing: **${names.join('** and **')}**` }],
          { title: 'Open the bracket', url: `${appUrl()}/bracket` },
        ),
      );
    }
  }
}

async function recomputePickem(bracketId: string, matches: Record<string, Partial<MatchDoc>>, championUid: string | null) {
  const season = await getSeason();
  const settings = (await db.doc(`seasons/${season.id}`).get()).get('pickem') ?? { tableWinnerPts: 3, championPts: 10 };
  const winners = Object.fromEntries(
    Object.entries(matches).filter(([, m]) => m.status === 'complete').map(([id, m]) => [id, m.advancing?.[0]]),
  );
  const picks = await db.collection('picks').where('bracketId', '==', bracketId).get();
  const batch = db.batch();
  for (const p of picks.docs) {
    const uid = p.get('uid') as string;
    const score = pickemScore({ champion: p.get('champion'), tables: p.get('tables') ?? {} }, winners, championUid, settings);
    batch.set(db.doc(`pickem/${bracketId}/entries/${uid}`), {
      displayName: p.get('displayName') ?? 'Player',
      avatarId: p.get('avatarId') ?? 'fox',
      avatarColor: p.get('avatarColor') ?? 'teal',
      ...score,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

// ---- Picks (players) ------------------------------------------------------------------------

export async function submitPicks(uid: string, bracketId: string, input: { champion?: string; tables?: Record<string, string> }) {
  const { bracket, matches } = await loadBracket(bracketId);
  if (bracket.status === 'draft') throw fail('failed-precondition', 'PICKS_LOCKED', 'Picks open when the bracket is locked.');
  const rejected: string[] = [];
  const tables: Record<string, string> = {};
  for (const [matchId, pick] of Object.entries(input.tables ?? {})) {
    const m = matches[matchId];
    const open = m && (m.status === 'waiting_for_players' || m.status === 'ready') && m.gameIds.length === 0 && m.slots.includes(pick);
    if (open) tables[matchId] = pick;
    else rejected.push(matchId);
  }
  const round1Started = Object.values(matches).some((m) => m.round === 1 && (m.gameIds.length > 0 || m.status === 'complete'));
  const championOk = input.champion && !round1Started && bracket.seeds.some((s) => s.uid === input.champion);
  if (input.champion && !championOk) rejected.push('champion');

  const user = (await db.doc(`users/${uid}`).get()).data() ?? {};
  const ref = db.doc(`picks/${bracketId}_${uid}`);
  await ref.set(
    {
      uid,
      bracketId,
      displayName: user.displayName ?? 'Player',
      avatarId: user.avatarId ?? 'fox',
      avatarColor: user.avatarColor ?? 'teal',
      ...(championOk ? { champion: input.champion, championLockedAt: FieldValue.serverTimestamp() } : {}),
      tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v])),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  // Make sure the picker shows on the Pick'em board straight away.
  const entryRef = db.doc(`pickem/${bracketId}/entries/${uid}`);
  if (!(await entryRef.get()).exists) {
    await entryRef.set({ displayName: user.displayName ?? 'Player', avatarId: user.avatarId ?? 'fox', avatarColor: user.avatarColor ?? 'teal', points: 0, correct: 0, champion: false, updatedAt: FieldValue.serverTimestamp() });
  }
  return { ok: true as const, rejected };
}

// ---- Overrides (admin) ----------------------------------------------------------------------

export async function overrideMatchResult(actorUid: string, bracketId: string, matchId: string, placements: string[], reason: string) {
  const { matches } = await loadBracket(bracketId);
  const m = matches[matchId];
  if (!m) throw fail('not-found', 'MATCH_NOT_FOUND', 'No such match.');
  const seated = m.slots.filter(Boolean) as string[];
  if (placements.length !== seated.length || !placements.every((p) => seated.includes(p))) {
    throw fail('invalid-argument', 'BAD_REQUEST', 'Placements must list every seated player exactly once.');
  }
  await matchesCol(bracketId).doc(matchId).set({ override: { placements, by: actorUid, reason, at: FieldValue.serverTimestamp() } }, { merge: true });
  await recomputeBracket(bracketId);
}

/** Void a game (results + game doc) — shared by voidGame and restartMatchGame. */
export async function voidGameDoc(gameId: string): Promise<DocumentData | undefined> {
  const gameRef = db.doc(`games/${gameId}`);
  const game = (await gameRef.get()).data();
  if (!game) throw fail('not-found', 'GAME_NOT_FOUND', 'No such game.');
  await gameRef.set({ status: 'voided', turnDeadline: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const result = db.doc(`results/${gameId}`);
  if ((await result.get()).exists) await result.set({ voided: true }, { merge: true });
  const batch = db.batch();
  for (const uid of (game.seatUids ?? []) as string[]) {
    const u = await db.doc(`users/${uid}`).get();
    if (u.get('activeGameId') === gameId) batch.set(u.ref, { activeGameId: null }, { merge: true });
  }
  await batch.commit();
  return game;
}

export async function restartMatchGame(bracketId: string, matchId: string): Promise<string> {
  const { matches } = await loadBracket(bracketId);
  const m = matches[matchId];
  if (!m?.currentGameId) throw fail('failed-precondition', 'BAD_REQUEST', 'No game to restart at this table.');
  await voidGameDoc(m.currentGameId);
  await matchesCol(bracketId).doc(matchId).set(
    { gameIds: FieldValue.arrayRemove(m.currentGameId), currentGameId: null, status: 'ready' },
    { merge: true },
  );
  return startMatchGame(bracketId, matchId, { force: true });
}
