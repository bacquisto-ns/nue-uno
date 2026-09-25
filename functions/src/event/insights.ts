import { computeAwards, seasonStats, type AwardStatsInput } from '@nue-uno/shared';
import { getDatabase } from 'firebase-admin/database';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../admin.js';
import { requireAdmin } from '../guards.js';
import { getSeason } from '../season.js';

type Req = Pick<CallableRequest<unknown>, 'auth' | 'data'>;

/** Actions that change a result by hand (PRD §13 "manual admin overrides"). */
const OVERRIDE_ACTIONS = ['overrideMatchResult', 'restartMatchGame', 'voidGame'];

async function activeBracketId(seasonId: string): Promise<string | null> {
  return ((await db.doc(`seasons/${seasonId}`).get()).get('activeBracketId') as string | undefined) ?? null;
}

/** playerStats docs for a season: ids are `{seasonId}_{uid}`. */
async function seasonPlayerStats(seasonId: string) {
  const snap = await db
    .collection('playerStats')
    .where(FieldPath.documentId(), '>=', `${seasonId}_`)
    .where(FieldPath.documentId(), '<', `${seasonId}_`)
    .get();
  return snap.docs.map((d) => ({ uid: d.id.slice(seasonId.length + 1), ...d.data() }));
}

/**
 * Build awards/{seasonId} (PRD E14, tournament.md §6) from playerStats, Passports, the Department
 * Cup, Pick'em and the bracket. Safe to re-run: the doc is replaced each time.
 */
export async function computeAwardsHandler(req: Req) {
  const { uid } = requireAdmin(req);
  const season = await getSeason({ fresh: true });
  const bracketId = await activeBracketId(season.id);
  const [stats, passports, users, cup, pickem, bracket] = await Promise.all([
    seasonPlayerStats(season.id),
    db.collection('passport').get(),
    db.collection('users').get(),
    db.collection(`departmentCup/${season.id}/entries`).orderBy('cupScore', 'desc').limit(1).get(),
    bracketId ? db.collection(`pickem/${bracketId}/entries`).orderBy('points', 'desc').limit(10).get() : null,
    bracketId ? db.doc(`brackets/${bracketId}`).get() : null,
  ]);
  const passportOf = Object.fromEntries(passports.docs.map((d) => [d.id, d.data()]));
  const names = Object.fromEntries(users.docs.map((d) => [d.id, (d.get('displayName') as string) ?? 'Player']));
  const players: AwardStatsInput[] = stats.map((s) => {
    const r = s as Record<string, unknown>;
    return {
      uid: s.uid,
      humanGames: Number(r.humanGames ?? 0),
      wild4Played: Number(r.wild4Played ?? 0),
      maxCardsHeldInWin: Number(r.maxCardsHeldInWin ?? 0),
      catches: Number(r.catches ?? 0),
      distinctCoworkers: Number(passportOf[s.uid]?.distinctCoworkers ?? 0),
      crossDeptPairs: Number(passportOf[s.uid]?.crossDeptPairs ?? 0),
    };
  });
  const cupTop = cup.docs[0];
  const items = computeAwards({
    championUid: (bracket?.get('championUid') as string | null | undefined) ?? null,
    players,
    names,
    cupLeader: cupTop ? { department: cupTop.get('department') as string, cupScore: Number(cupTop.get('cupScore') ?? 0) } : null,
    pickem: (pickem?.docs ?? []).map((d) => ({ uid: d.id, displayName: (d.get('displayName') as string) ?? 'Player', points: Number(d.get('points') ?? 0) })),
  });
  await db.doc(`awards/${season.id}`).set({ items, computedAt: FieldValue.serverTimestamp() });
  await db.collection('auditLog').add({ actorUid: uid, action: 'computeAwards', target: `awards/${season.id}`, after: { count: items.length }, reason: null, at: FieldValue.serverTimestamp() });
  return { ok: true as const, count: items.length };
}

/** PRD AD10: the §13 success metrics, computed on demand (read-only, so not audited). */
export async function adminStatsHandler(req: Req) {
  requireAdmin(req);
  const season = await getSeason({ fresh: true });
  const bracketId = await activeBracketId(season.id);
  const [users, roster, results, passports, picks, overrides, reactions] = await Promise.all([
    db.collection('users').get(),
    db.collection('roster').count().get(),
    db.collection('results').where('seasonId', '==', season.id).get(),
    db.collection('passport').get(),
    bracketId ? db.collection('picks').where('bracketId', '==', bracketId).get() : null,
    db.collection('auditLog').where('action', 'in', OVERRIDE_ACTIONS).count().get(),
    getDatabase().ref('reactions').get().catch(() => null),
  ]);
  const reactionUids = new Set<string>();
  for (const target of Object.values((reactions?.val() ?? {}) as Record<string, Record<string, unknown>>)) {
    Object.keys(target ?? {}).forEach((u) => reactionUids.add(u));
  }
  const ms = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : null);
  return seasonStats({
    users: users.docs.map((d) => ({
      uid: d.id,
      status: (d.get('status') as string) ?? 'pending',
      attendingEvent: (d.get('attendingEvent') as string) ?? null,
      createdAtMs: ms(d.get('createdAt')),
      firstGameAtMs: ms(d.get('firstGameAt')),
    })),
    rosterSize: roster.data().count,
    results: results.docs.map((d) => ({
      mode: d.get('mode'),
      voided: !!d.get('voided'),
      playerUids: (d.get('playerUids') as string[]) ?? [],
      finishedAtMs: ms(d.get('finishedAt')) ?? 0,
    })),
    passports: passports.docs.map((d) => ({ uid: d.id, distinctCoworkers: Number(d.get('distinctCoworkers') ?? 0), crossDeptPairs: Number(d.get('crossDeptPairs') ?? 0) })),
    pickemUids: (picks?.docs ?? []).map((d) => d.get('uid') as string),
    reactionUids: [...reactionUids],
    adminOverrides: overrides.data().count,
    timeZone: season.timezone,
  });
}
