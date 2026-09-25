import { onValue, ref } from 'firebase/database';
import { useEffect, useRef } from 'react';
import { rtdb } from '../rtdb';

export interface Ping<K extends string> {
  uid: string;
  key: K;
  at: number;
}

/**
 * Emotes and reactions keep only each user's *latest* ping at `path/{uid}` (architecture §RTDB).
 * This reports each new one exactly once: the first snapshot is the baseline (history is never
 * replayed), then any uid whose `at` moved forward is a fresh ping.
 */
export function usePings<K extends string>(path: string | null, field: 'e' | 'r', onPing: (p: Ping<K>) => void): void {
  const cb = useRef(onPing);
  useEffect(() => {
    cb.current = onPing;
  });
  useEffect(() => {
    if (!path) return;
    let seen: Record<string, number> | null = null;
    return onValue(ref(rtdb, path), (snap) => {
      const all = (snap.val() ?? {}) as Record<string, Record<string, unknown>>;
      const next: Record<string, number> = {};
      for (const [uid, v] of Object.entries(all)) {
        const at = typeof v.at === 'number' ? v.at : 0;
        next[uid] = at;
        if (seen && at > (seen[uid] ?? 0) && typeof v[field] === 'string') cb.current({ uid, key: v[field] as K, at });
      }
      seen = next;
    });
  }, [field, path]);
}
