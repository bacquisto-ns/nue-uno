import { getDatabase } from 'firebase-admin/database';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../admin.js';
import { clock } from '../clock.js';
import { parse, requirePlayer } from '../guards.js';

const NUDGE_EVERY_MS = 2 * 60_000;
const MAX_NUDGES = 30;

interface StatusNode {
  state?: string;
  activity?: string;
  at?: number;
}

/** Players currently online (RTDB presence — ADR-6) who are browsing the lobby. */
export async function onlineLobbyUids(): Promise<string[]> {
  const snap = await getDatabase().ref('status').get();
  const all = (snap.val() ?? {}) as Record<string, StatusNode>;
  return Object.entries(all)
    .filter(([, s]) => s.state === 'online' && (s.activity ?? 'lobby') === 'lobby')
    .map(([uid]) => uid);
}

/**
 * "Table forming" nudges (PRD L7): when a ranked lobby needs exactly one more player, tell online
 * players who aren't at a table — at most once every 2 minutes each.
 */
export async function nudgeIfForming(gameId: string): Promise<number> {
  const after = (await db.doc(`games/${gameId}`).get()).data();
  if (!after || after.status !== 'lobby' || after.requestedMode !== 'ranked' || after.bracketId) return 0;
  const seats: string[] = after.seatUids ?? [];
  if (seats.length !== after.maxSeats - 1) return 0;

  const now = clock.now();
  const candidates = (await onlineLobbyUids()).filter((uid) => !seats.includes(uid)).slice(0, MAX_NUDGES);
  const host = (after.seats ?? []).find((s: { uid: string }) => s.uid === after.hostUid)?.displayName ?? 'A';
  let sent = 0;
  for (const uid of candidates) {
    const userRef = db.doc(`users/${uid}`);
    const ok = await db.runTransaction(async (tx) => {
      const user = await tx.get(userRef);
      if (!user.exists || user.get('status') !== 'active' || user.get('activeGameId')) return false;
      const last = user.get('lastNudgedAt')?.toMillis?.() ?? 0;
      if (now - last < NUDGE_EVERY_MS) return false;
      tx.set(userRef, { lastNudgedAt: Timestamp.fromMillis(now) }, { merge: true });
      tx.set(db.collection(`inbox/${uid}/items`).doc(), {
        type: 'table_forming',
        title: 'A ranked table needs 1 more player',
        body: `${host}'s table is one seat away from starting.`,
        link: `/t/${gameId}`,
        takeover: false,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + NUDGE_EVERY_MS),
        seenAt: null,
      });
      return true;
    });
    if (ok) sent++;
  }
  return sent;
}

const MarkSeenInput = z.object({ itemIds: z.array(z.string().min(1).max(128)).min(1).max(50) });

export async function markInboxSeenHandler(req: Pick<CallableRequest<unknown>, 'auth' | 'data'>) {
  const { uid } = requirePlayer(req);
  const { itemIds } = parse(MarkSeenInput, req.data);
  const batch = db.batch();
  for (const id of itemIds) batch.set(db.doc(`inbox/${uid}/items/${id}`), { seenAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  return { ok: true as const };
}
