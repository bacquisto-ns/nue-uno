import { collection, query } from 'firebase/firestore';
import { db, useDoc, useQuery } from './firestore';
import { useSeason } from './season';

export type MatchStatus = 'waiting_for_players' | 'ready' | 'in_progress' | 'complete';

export interface MatchView {
  id: string;
  round: number;
  roundName: string;
  table: string;
  physicalTable: number;
  slots: (string | null)[];
  status: MatchStatus;
  checkedIn: string[];
  gamesToPlay: number;
  gameIds: string[];
  currentGameId: string | null;
  standings: { uid: string; points: number; wins: number; lastPlace: number }[];
  advancing: string[];
  override: { placements: string[]; reason: string } | null;
}

export interface BracketView {
  seasonId: string;
  status: 'draft' | 'locked' | 'in_progress' | 'complete';
  size: number;
  seeds: { seed: number; uid: string; displayName: string; score: number }[];
  rounds: { number: number; name: string; matchIds: string[] }[];
  finalGames: number;
  championUid: string | null;
}

export interface PlayerCard {
  displayName: string;
  avatarId: string;
  avatarColor: string;
  department: string | null;
}

/** Everyone's display card, keyed by uid (≤ 500 users — the whole company fits). */
export function useDirectory(): Record<string, PlayerCard> {
  const users = useQuery<PlayerCard>(query(collection(db, 'users')), 'users-all');
  return Object.fromEntries((users.data ?? []).map((u) => [u.id, u]));
}

/** The season's active bracket and its matches, live. */
export function useActiveBracket() {
  const season = useSeason();
  const seasonDoc = useDoc<{ activeBracketId?: string | null; pausedAt?: unknown }>(`seasons/${season.id}`);
  const bracketId = seasonDoc.data?.activeBracketId ?? null;
  const bracket = useDoc<BracketView>(bracketId ? `brackets/${bracketId}` : null);
  const matches = useQuery<Omit<MatchView, 'id'>>(
    bracketId ? query(collection(db, `brackets/${bracketId}/matches`)) : null,
    `matches-${bracketId}`,
  );
  const byId = Object.fromEntries((matches.data ?? []).map((m) => [m.id, m as MatchView]));
  return {
    season,
    paused: !!seasonDoc.data?.pausedAt,
    bracketId,
    bracket: bracket.data ?? null,
    matches: byId,
    loading: seasonDoc.data === undefined || (bracketId !== null && (bracket.data === undefined || matches.data === undefined)),
  };
}

/** The match this player is in (or next in), if any. */
export function myMatch(matches: Record<string, MatchView>, uid: string): MatchView | null {
  const mine = Object.values(matches)
    .filter((m) => m.slots.includes(uid) && m.status !== 'complete')
    .sort((a, b) => a.round - b.round);
  return mine[0] ?? null;
}
