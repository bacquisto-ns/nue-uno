import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../admin.js';
import { clock } from '../clock.js';

const LOBBY_IDLE_MS = 30 * 60_000;
const GAME_IDLE_MS = 2 * 60 * 60_000;

/**
 * Abandon idle lobbies (> 30 min) and stalled games (> 2 h) and free their players (api.md §5).
 * Abandoned games never produce results.
 */
export async function cleanupStaleGames(): Promise<{ abandoned: number }> {
  const now = clock.now();
  const [lobbies, games] = await Promise.all([
    db.collection('games').where('status', '==', 'lobby')
      .where('updatedAt', '<', Timestamp.fromMillis(now - LOBBY_IDLE_MS)).get(),
    db.collection('games').where('status', '==', 'in_progress')
      .where('updatedAt', '<', Timestamp.fromMillis(now - GAME_IDLE_MS)).get(),
  ]);
  let abandoned = 0;
  for (const snap of [...lobbies.docs, ...games.docs]) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(snap.ref);
      if (!fresh.exists || !['lobby', 'in_progress'].includes(fresh.get('status'))) return;
      const seatUids: string[] = fresh.get('seatUids') ?? [];
      const users = await Promise.all(seatUids.map((uid) => tx.get(db.doc(`users/${uid}`))));
      tx.set(snap.ref, { status: 'abandoned', turnDeadline: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      for (const u of users) {
        if (u.get('activeGameId') === snap.id) tx.set(u.ref, { activeGameId: null }, { merge: true });
      }
      abandoned++;
    });
  }
  return { abandoned };
}
