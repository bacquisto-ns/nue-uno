import {
  doc,
  onSnapshot,
  type DocumentData,
  type Query,
  type SnapshotMetadata,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firestore';

// Only imported by lazily-loaded routes, so Firestore stays out of the sign-in bundle.

export interface Live<T> {
  data: T | undefined;
  /** True while served from cache (offline / reconnecting — PRD G6). */
  fromCache: boolean;
  error: Error | null;
}

/** Live document; `data` is undefined while loading and null if the doc doesn't exist. */
export function useDoc<T = DocumentData>(path: string | null): Live<T | null> & { metadata?: SnapshotMetadata } {
  const [state, setState] = useState<Live<T | null> & { key: string | null; metadata?: SnapshotMetadata }>({
    key: null,
    data: undefined,
    fromCache: false,
    error: null,
  });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(db, path),
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          key: path,
          data: snap.exists() ? (snap.data() as T) : null,
          fromCache: snap.metadata.fromCache,
          error: null,
          metadata: snap.metadata,
        }),
      (error) => setState({ key: path, data: undefined, fromCache: false, error }),
    );
  }, [path]);
  // Ignore stale data from a previous path.
  return state.key === path ? state : { data: undefined, fromCache: false, error: null };
}

/** Live query results with document ids. `key` must change whenever the query changes. */
export function useQuery<T = DocumentData>(q: Query | null, key: string): Live<(T & { id: string })[]> {
  const [state, setState] = useState<Live<(T & { id: string })[]> & { key: string | null }>({
    key: null,
    data: undefined,
    fromCache: false,
    error: null,
  });
  useEffect(() => {
    if (!q) return;
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          key,
          data: snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })),
          fromCache: snap.metadata.fromCache,
          error: null,
        }),
      (error) => setState({ key, data: undefined, fromCache: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the query
  }, [key]);
  return state.key === key ? state : { data: undefined, fromCache: false, error: null };
}

export { db };
