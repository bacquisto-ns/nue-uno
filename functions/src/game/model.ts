import type { PublicGameState } from '@nue-uno/engine';
import type { Timestamp } from 'firebase-admin/firestore';

export type GameStatus = 'lobby' | 'in_progress' | 'finished' | 'abandoned' | 'voided';
export type GameMode = 'casual' | 'ranked' | 'bracket';

export interface Seat {
  uid: string;
  displayName: string;
  avatarId: string;
  avatarColor: string;
  department: string | null;
}

/** Meta fields on games/{gameId}; engine public state is merged in once the game starts. */
export interface GameMeta {
  seasonId: string;
  status: GameStatus;
  requestedMode: 'casual' | 'ranked';
  mode: GameMode | null;
  hostUid: string;
  seats: Seat[];
  /** Seat uids — mirrors `players` so lobby queries don't depend on engine state. */
  seatUids: string[];
  maxSeats: number;
  autoStart: boolean;
  collusionWarning: boolean;
  bracketId: string | null;
  matchId: string | null;
  turnMs: number | null;
  turnDeadline: Timestamp | null;
  finalLapAt: Timestamp | null;
  paused: boolean;
  lastEventSeq: number;
  version: number;
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  finishedAt: Timestamp | null;
  updatedAt: Timestamp;
}

export type GameDoc = GameMeta & Partial<PublicGameState>;
