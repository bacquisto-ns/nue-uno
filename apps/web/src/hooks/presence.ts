import { onDisconnect, onValue, ref, serverTimestamp, set } from 'firebase/database';
import { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { rtdb } from '../rtdb';

export type Activity = 'lobby' | 'game' | 'spectating' | 'tv';

/**
 * Announce this device as online (ADR-6). Firebase's onDisconnect marks us offline even if the tab
 * crashes. Mount once per screen with the current activity.
 */
export function usePresence(activity: Activity, gameId?: string): void {
  const uid = useSession((s) => s.user?.uid);
  const active = useSession((s) => s.claims.active);
  useEffect(() => {
    if (!uid || !active) return;
    const me = ref(rtdb, `status/${uid}`);
    const online = { state: 'online', activity, ...(gameId ? { gameId } : {}), at: serverTimestamp() };
    const connected = ref(rtdb, '.info/connected');
    const unsub = onValue(connected, (snap) => {
      if (snap.val() !== true) return;
      void onDisconnect(me)
        .set({ state: 'offline', at: serverTimestamp() })
        .then(() => set(me, online));
    });
    return () => unsub();
  }, [uid, active, activity, gameId]);
}

export interface OnlineUser {
  uid: string;
  activity: Activity;
}

/** Everyone currently online (lobby's "Online now" row — PRD L6). */
export function useOnlineUsers(): OnlineUser[] {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  useEffect(
    () =>
      onValue(ref(rtdb, 'status'), (snap) => {
        const all = (snap.val() ?? {}) as Record<string, { state?: string; activity?: Activity }>;
        setUsers(
          Object.entries(all)
            .filter(([, s]) => s.state === 'online')
            .map(([uid, s]) => ({ uid, activity: s.activity ?? 'lobby' })),
        );
      }),
    [],
  );
  return users;
}
