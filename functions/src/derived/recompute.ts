import {
  compareEntries,
  cupEntryFor,
  DEFAULT_DEPARTMENTS,
  leaderboardEntryFor,
  passportFor,
  playerStatsFor,
  type ResultDoc,
} from '@nue-uno/shared';
import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { getSeason } from '../season.js';
import { adaptiveCard, appUrl, postToTeams } from '../teams.js';
import { recomputeBracket } from '../event/bracket.js';

const toResult = (id: string, d: DocumentData): ResultDoc => ({
  id,
  seasonId: d.seasonId,
  mode: d.mode,
  tableSize: d.tableSize,
  turnCount: d.turnCount,
  placements: d.placements ?? [],
  playerUids: d.playerUids ?? [],
  finishedAtMs: d.finishedAt?.toMillis?.() ?? 0,
  voided: !!d.voided,
});

/** Cup doc ids must not contain "/" — department names might. */
export const cupDocId = (dept: string) => encodeURIComponent(dept);

async function resultsFor(uid: string, seasonId: string): Promise<ResultDoc[]> {
  const snap = await db.collection('results').where('playerUids', 'array-contains', uid).get();
  return snap.docs.map((d) => toResult(d.id, d.data())).filter((r) => r.seasonId === seasonId);
}

/**
 * Recompute everything derived from one player's results: leaderboard entry, Passport, stats and
 * first-game time. Idempotent — safe to re-run after voids or duplicate trigger deliveries.
 */
export async function recomputePlayer(uid: string, seasonId: string): Promise<void> {
  const season = await getSeason();
  const [results, userSnap, configSnap] = await Promise.all([
    resultsFor(uid, seasonId),
    db.doc(`users/${uid}`).get(),
    db.doc('config/app').get(),
  ]);
  const user = userSnap.data() ?? {};
  const departments: string[] = configSnap.get('departments') ?? [...DEFAULT_DEPARTMENTS];

  const entryRef = db.doc(`leaderboard/${seasonId}/entries/${uid}`);
  const entry = leaderboardEntryFor(uid, results, season.scoring);
  const hasEntry = (await entryRef.get()).exists;
  if (entry.rankedGames > 0 || hasEntry) {
    await entryRef.set({
      displayName: user.displayName ?? 'Player',
      avatarId: user.avatarId ?? 'fox',
      avatarColor: user.avatarColor ?? 'teal',
      department: user.department ?? null,
      attendingEvent: user.attendingEvent ?? 'maybe',
      ...entry,
      scoreReachedAt: entry.scoreReachedAtMs ? Timestamp.fromMillis(entry.scoreReachedAtMs) : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const passport = passportFor(uid, user.department ?? null, results, departments, user.tutorialDone ? ['tutorial'] : []);
  await db.doc(`passport/${uid}`).set({ ...passport, updatedAt: FieldValue.serverTimestamp() });
  await db.doc(`playerStats/${seasonId}_${uid}`).set({ ...playerStatsFor(uid, results), updatedAt: FieldValue.serverTimestamp() });

  if (!user.firstGameAt && results.length > 0) {
    const first = Math.min(...results.map((r) => r.finishedAtMs));
    await db.doc(`users/${uid}`).set({ firstGameAt: Timestamp.fromMillis(first) }, { merge: true });
  }
}

/** results/{gameId} written → recompute every player in it (before and after, for voids). */
export async function onResultWrittenHandler(before: DocumentData | undefined, after: DocumentData | undefined) {
  const doc = after ?? before;
  if (!doc) return;
  const uids = new Set<string>([...(before?.playerUids ?? []), ...(after?.playerUids ?? [])]);
  for (const uid of uids) await recomputePlayer(uid, doc.seasonId);
  // Bracket games also advance the bracket (tournament.md §3 — recomputed from source).
  if (doc.bracketId) await recomputeBracket(doc.bracketId);
}

/** Recompute one department's Cup entry from its members' leaderboard entries. */
export async function recomputeCup(seasonId: string, department: string): Promise<void> {
  const season = await getSeason();
  const members = await db
    .collection(`leaderboard/${seasonId}/entries`)
    .where('department', '==', department)
    .get();
  const ref = db.doc(`departmentCup/${seasonId}/entries/${cupDocId(department)}`);
  if (members.empty) {
    await ref.delete();
    return;
  }
  const entry = cupEntryFor(
    department,
    members.docs.map((d) => ({ uid: d.id, score: d.get('score') ?? 0, rankedGames: d.get('rankedGames') ?? 0 })),
    season.cup,
  );
  await ref.set({ ...entry, updatedAt: FieldValue.serverTimestamp() });
}

/**
 * leaderboard entry written → recompute the Cup for the department(s) involved, and announce a new
 * #1 in Teams (tracked in seasons/{id}/state/leader so each change is posted once).
 */
export async function onLeaderboardEntryWrittenHandler(
  seasonId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<void> {
  const depts = new Set<string>([before?.department, after?.department].filter(Boolean));
  for (const d of depts) await recomputeCup(seasonId, d);

  if (!after || (before && before.score === after.score)) return;
  const top = await db.collection(`leaderboard/${seasonId}/entries`).orderBy('score', 'desc').limit(5).get();
  const leader = top.docs
    .map((d) => ({ uid: d.id, ...(d.data() as { score: number; winRate: number; avgPlace: number }), scoreReachedAtMs: d.get('scoreReachedAt')?.toMillis?.() ?? null }))
    .sort(compareEntries)[0];
  if (!leader || leader.score <= 0) return;
  const stateRef = db.doc(`seasons/${seasonId}/state/leader`);
  const changed = await db.runTransaction(async (tx) => {
    const prev = (await tx.get(stateRef)).get('uid');
    if (prev === leader.uid) return false;
    tx.set(stateRef, { uid: leader.uid, at: FieldValue.serverTimestamp() });
    return true;
  });
  if (changed) {
    const name = top.docs.find((d) => d.id === leader.uid)?.get('displayName') ?? 'Someone';
    await postToTeams(
      'newLeader',
      adaptiveCard('👑 New #1 on the Nue Uno leaderboard!', [{ text: `**${name}** takes the top spot with **${leader.score}** points.` }], {
        title: 'See the leaderboard',
        url: `${appUrl()}/leaderboard`,
      }),
    );
  }
}

/** users/{uid} written → refresh the denormalized copy on the leaderboard (and so the Cup). */
export async function onUserWrittenHandler(uid: string, after: DocumentData | undefined): Promise<void> {
  if (!after) return;
  const season = await getSeason();
  const ref = db.doc(`leaderboard/${season.id}/entries/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const next = {
    displayName: after.displayName,
    avatarId: after.avatarId,
    avatarColor: after.avatarColor ?? 'teal',
    department: after.department ?? null,
    attendingEvent: after.attendingEvent ?? 'maybe',
  };
  const cur = snap.data()!;
  if (Object.entries(next).some(([k, v]) => cur[k] !== v)) await ref.set(next, { merge: true });
}
