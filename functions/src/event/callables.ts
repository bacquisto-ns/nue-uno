import { CheckInAtTableInput, CheckInMatchInput, SubmitPicksInput } from '@nue-uno/shared';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from '../admin.js';
import { clock } from '../clock.js';
import { fail } from '../errors.js';
import { parse, requireAdmin, requirePlayer } from '../guards.js';
import { clearSeasonCache, getSeason } from '../season.js';
import {
  checkIn,
  checkInAtTable,
  editBracketSeeds,
  generateBracketFor,
  lockBracket,
  overrideMatchResult,
  recomputeBracket,
  restartMatchGame,
  setPhysicalTables,
  startMatchGame,
  submitPicks,
  voidGameDoc,
} from './bracket.js';

type Req = Pick<CallableRequest<unknown>, 'auth' | 'data'>;
const Id = z.string().min(1).max(128);
const Reason = z.string().trim().min(3, 'Give a short reason').max(300);

function audit(actorUid: string, action: string, target: string, after: unknown, reason?: string) {
  return db.collection('auditLog').add({ actorUid, action, target, after: after ?? null, reason: reason ?? null, at: FieldValue.serverTimestamp() });
}

// ---- Players --------------------------------------------------------------------------------

export async function checkInMatchHandler(req: Req) {
  const { uid } = requirePlayer(req);
  const { bracketId, matchId } = parse(CheckInMatchInput, req.data);
  return checkIn(uid, bracketId, matchId);
}

export async function checkInAtTableHandler(req: Req) {
  const { uid } = requirePlayer(req);
  const { physicalTable } = parse(CheckInAtTableInput, req.data);
  return checkInAtTable(uid, physicalTable);
}

export async function submitPicksHandler(req: Req) {
  const { uid } = requirePlayer(req);
  const input = parse(SubmitPicksInput, req.data);
  return submitPicks(uid, input.bracketId, { champion: input.champion, tables: input.tables });
}

// ---- Admin: bracket -------------------------------------------------------------------------

const GenerateInput = z.object({ size: z.number().int().min(3).max(64).optional(), excludeUids: z.array(Id).max(64).optional() });
export async function generateBracketHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const input = parse(GenerateInput, req.data);
  const res = await generateBracketFor(uid, input);
  await audit(uid, 'generateBracket', `brackets/${res.bracketId}`, res);
  return { ok: true as const, ...res };
}

const EditSeedsInput = z.object({ bracketId: Id, seeds: z.array(z.object({ seed: z.number().int().min(1), uid: Id })).min(1) });
export async function editBracketSeedsHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { bracketId, seeds } = parse(EditSeedsInput, req.data);
  await editBracketSeeds(bracketId, seeds);
  await audit(uid, 'editBracketSeeds', `brackets/${bracketId}`, seeds);
  return { ok: true as const };
}

const PhysicalInput = z.object({ bracketId: Id, map: z.record(Id, z.number().int().min(1).max(20)) });
export async function setPhysicalTablesHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { bracketId, map } = parse(PhysicalInput, req.data);
  await setPhysicalTables(bracketId, map);
  await audit(uid, 'setPhysicalTables', `brackets/${bracketId}`, map);
  return { ok: true as const };
}

const BracketRef = z.object({ bracketId: Id });
export async function lockBracketHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { bracketId } = parse(BracketRef, req.data);
  await lockBracket(bracketId);
  await audit(uid, 'lockBracket', `brackets/${bracketId}`, { status: 'locked' });
  return { ok: true as const };
}

const StartMatchInput = z.object({ bracketId: Id, matchId: Id, force: z.boolean().optional() });
export async function startMatchHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { bracketId, matchId, force } = parse(StartMatchInput, req.data);
  const gameId = await startMatchGame(bracketId, matchId, { force });
  await audit(uid, 'startMatch', `brackets/${bracketId}/matches/${matchId}`, { gameId, force: !!force });
  return { ok: true as const, gameId };
}

const OverrideInput = z.object({ bracketId: Id, matchId: Id, placements: z.array(Id).min(2).max(4), reason: Reason });
export async function overrideMatchResultHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { bracketId, matchId, placements, reason } = parse(OverrideInput, req.data);
  await overrideMatchResult(uid, bracketId, matchId, placements, reason);
  await audit(uid, 'overrideMatchResult', `brackets/${bracketId}/matches/${matchId}`, placements, reason);
  return { ok: true as const };
}

const RestartInput = z.object({ bracketId: Id, matchId: Id, reason: Reason });
export async function restartMatchGameHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { bracketId, matchId, reason } = parse(RestartInput, req.data);
  const gameId = await restartMatchGame(bracketId, matchId);
  await audit(uid, 'restartMatchGame', `brackets/${bracketId}/matches/${matchId}`, { gameId }, reason);
  return { ok: true as const, gameId };
}

const VoidInput = z.object({ gameId: Id, reason: Reason });
export async function voidGameHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { gameId, reason } = parse(VoidInput, req.data);
  const game = await voidGameDoc(gameId);
  if (game?.bracketId) await recomputeBracket(game.bracketId);
  await audit(uid, 'voidGame', `games/${gameId}`, { status: 'voided' }, reason);
  return { ok: true as const };
}

// ---- Admin: live event controls -------------------------------------------------------------

/** Freeze every in-progress bracket game (AD6). Moves and timeouts are rejected while paused. */
export async function pauseAllHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const season = await getSeason({ fresh: true });
  const now = clock.now();
  const games = await db.collection('games').where('status', '==', 'in_progress').get();
  const batch = db.batch();
  let n = 0;
  for (const g of games.docs) {
    if (!g.get('bracketId') || g.get('paused')) continue;
    batch.set(g.ref, { paused: true, pausedAtMs: now, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    n++;
  }
  batch.set(db.doc(`seasons/${season.id}`), { pausedAt: Timestamp.fromMillis(now) }, { merge: true });
  await batch.commit();
  clearSeasonCache();
  await audit(uid, 'pauseAll', `seasons/${season.id}`, { games: n });
  return { ok: true as const, paused: n };
}

/** Resume: every paused game gets its remaining turn time and Final Lap time back. */
export async function resumeAllHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const season = await getSeason({ fresh: true });
  const now = clock.now();
  const games = await db.collection('games').where('status', '==', 'in_progress').get();
  const batch = db.batch();
  let n = 0;
  for (const g of games.docs) {
    if (!g.get('paused')) continue;
    const shift = now - (g.get('pausedAtMs') ?? now);
    const bump = (t: Timestamp | null | undefined) => (t ? Timestamp.fromMillis(t.toMillis() + shift) : null);
    batch.set(
      g.ref,
      { paused: false, pausedAtMs: null, turnDeadline: bump(g.get('turnDeadline')), finalLapAt: bump(g.get('finalLapAt')), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    n++;
  }
  batch.set(db.doc(`seasons/${season.id}`), { pausedAt: null }, { merge: true });
  await batch.commit();
  clearSeasonCache();
  await audit(uid, 'resumeAll', `seasons/${season.id}`, { games: n });
  return { ok: true as const, resumed: n };
}

const BroadcastInput = z.object({ text: z.string().trim().min(2).max(200), level: z.enum(['info', 'urgent']), ttlMinutes: z.number().int().min(1).max(600) });
export async function broadcastHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { text, level, ttlMinutes } = parse(BroadcastInput, req.data);
  const ref = await db.collection('announcements').add({
    text,
    level,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(clock.now() + ttlMinutes * 60_000),
    active: true,
  });
  await audit(uid, 'broadcast', `announcements/${ref.id}`, { text, level, ttlMinutes });
  return { ok: true as const, id: ref.id };
}

export async function clearBroadcastHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const { id } = parse(z.object({ id: Id }), req.data);
  await db.doc(`announcements/${id}`).set({ active: false }, { merge: true });
  await audit(uid, 'clearBroadcast', `announcements/${id}`, { active: false });
  return { ok: true as const };
}

const TvInput = z.object({
  scene: z.enum(['bracket', 'intros', 'selection', 'pickem', 'cup', 'featured', 'awards', 'champion']),
  featuredGameId: Id.nullish(),
  autoCycle: z.boolean().optional(),
  /** Selection Show: 0 = title card, k = k seeds revealed (bottom seed first), size + 1 = finale. */
  selectionStep: z.number().int().min(0).max(65).nullish(),
  /** Player Intros: the match whose walk-out cards to show (null = the next table up). */
  introMatchId: Id.nullish(),
});
export async function setTvSceneHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const input = parse(TvInput, req.data);
  await db.doc('tv/state').set({ ...input, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(uid, 'setTvScene', 'tv/state', input);
  if (input.scene === 'selection' && input.selectionStep) await notifySelected(input.selectionStep);
  return { ok: true as const };
}

/**
 * Selection Show (PRD E9): the moment a seed is revealed on the TV, that player's phone buzzes
 * "You're in! Seed 7, Table 2". The doc id is deterministic, so stepping back and forth never
 * sends it twice.
 */
async function notifySelected(step: number) {
  const season = await getSeason();
  const bracketId: string | undefined = (await db.doc(`seasons/${season.id}`).get()).get('activeBracketId');
  if (!bracketId) return;
  const bracket = (await db.doc(`brackets/${bracketId}`).get()).data();
  const seeds = (bracket?.seeds ?? []) as { seed: number; uid: string }[];
  const seed = seeds.length - step + 1;
  const player = seeds.find((s) => s.seed === seed);
  if (!player) return;
  const matches = await db.collection(`brackets/${bracketId}/matches`).where('round', '==', 1).get();
  const table = matches.docs.find((d) => (d.get('slots') as (string | null)[]).includes(player.uid))?.get('physicalTable');
  const ref = db.doc(`inbox/${player.uid}/items/selection-${bracketId}`);
  if ((await ref.get()).exists) return;
  await ref.set({
    type: 'selected',
    title: `You're in! Seed ${seed}${table ? `, Table ${table}` : ''}`,
    body: "You've made the bracket. Watch the big screen, and head to your table when it's called.",
    link: '/',
    takeover: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60_000),
    seenAt: null,
  });
}

const SeasonInput = z.object({
  status: z.enum(['setup', 'qualifying', 'locked', 'event', 'complete']).optional(),
  qualifierStartMs: z.number().int().optional(),
  qualifierEndMs: z.number().int().optional(),
  bracketSize: z.number().int().min(3).max(64).optional(),
});
export async function setSeasonHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const input = parse(SeasonInput, req.data);
  if (input.qualifierStartMs && input.qualifierEndMs && input.qualifierEndMs <= input.qualifierStartMs) {
    throw fail('invalid-argument', 'BAD_REQUEST', 'The window must end after it starts.');
  }
  const season = await getSeason({ fresh: true });
  const update: Record<string, unknown> = {};
  if (input.status) update.status = input.status;
  if (input.bracketSize) update.bracketSize = input.bracketSize;
  if (input.qualifierStartMs) update.qualifierStart = Timestamp.fromMillis(input.qualifierStartMs);
  if (input.qualifierEndMs) update.qualifierEnd = Timestamp.fromMillis(input.qualifierEndMs);
  await db.doc(`seasons/${season.id}`).set(update, { merge: true });
  clearSeasonCache();
  await audit(uid, 'setSeason', `seasons/${season.id}`, input);
  return { ok: true as const };
}
