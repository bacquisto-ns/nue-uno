import type { SeasonStats } from '@nue-uno/shared';
import { call } from './call';

type Ok = { ok: true };

/** Admin tools share one callable: `admin` with `{ action, payload }` (functions/src/event/adminRouter.ts). */
const adminCall = <Res>(action: string, payload: unknown = {}) =>
  call<{ action: string; payload: unknown }, Res>('admin', { action, payload });

export type TvScene = 'bracket' | 'intros' | 'selection' | 'pickem' | 'cup' | 'featured' | 'awards' | 'champion';
export type SeasonStatus = 'setup' | 'qualifying' | 'locked' | 'event' | 'complete';

/** Event-day callables (docs/engineering/api.md — Week 4). */
export const eventApi = {
  checkInMatch: (bracketId: string, matchId: string) =>
    call<{ bracketId: string; matchId: string }, Ok & { gameId?: string }>('checkInMatch', { bracketId, matchId }),
  checkInAtTable: (physicalTable: number) =>
    call<{ physicalTable: number }, Ok & { gameId?: string; matchId: string; bracketId: string }>('checkInAtTable', { physicalTable }),
  submitPicks: (bracketId: string, picks: { champion?: string; tables?: Record<string, string> }) =>
    call<{ bracketId: string; champion?: string; tables?: Record<string, string> }, Ok & { rejected: string[] }>('submitPicks', {
      bracketId,
      ...picks,
    }),

  // Admin
  generateBracket: (size?: number) => adminCall<Ok & { bracketId: string; size: number }>('generateBracket', size ? { size } : {}),
  editBracketSeeds: (bracketId: string, seeds: { seed: number; uid: string }[]) => adminCall<Ok>('editBracketSeeds', { bracketId, seeds }),
  setPhysicalTables: (bracketId: string, map: Record<string, number>) => adminCall<Ok>('setPhysicalTables', { bracketId, map }),
  lockBracket: (bracketId: string) => adminCall<Ok>('lockBracket', { bracketId }),
  startMatch: (bracketId: string, matchId: string, force = false) =>
    adminCall<Ok & { gameId: string }>('startMatch', { bracketId, matchId, force }),
  overrideMatchResult: (bracketId: string, matchId: string, placements: string[], reason: string) =>
    adminCall<Ok>('overrideMatchResult', { bracketId, matchId, placements, reason }),
  restartMatchGame: (bracketId: string, matchId: string, reason: string) =>
    adminCall<Ok & { gameId: string }>('restartMatchGame', { bracketId, matchId, reason }),
  voidGame: (gameId: string, reason: string) => adminCall<Ok>('voidGame', { gameId, reason }),
  pauseAll: () => adminCall<Ok & { paused: number }>('pauseAll'),
  resumeAll: () => adminCall<Ok & { resumed: number }>('resumeAll'),
  broadcast: (text: string, level: 'info' | 'urgent', ttlMinutes: number) =>
    adminCall<Ok & { id: string }>('broadcast', { text, level, ttlMinutes }),
  clearBroadcast: (id: string) => adminCall<Ok>('clearBroadcast', { id }),
  setTvScene: (
    scene: TvScene,
    opts: { featuredGameId?: string | null; autoCycle?: boolean; selectionStep?: number | null; introMatchId?: string | null; awardsStep?: number | null } = {},
  ) =>
    adminCall<Ok>('setTvScene', { scene, ...opts }),
  setSeason: (input: { status?: SeasonStatus; qualifierStartMs?: number; qualifierEndMs?: number; bracketSize?: number }) =>
    adminCall<Ok>('setSeason', input),
  approveUser: (uid: string) => adminCall<Ok>('approveUser', { uid }),
  adminUpdateUser: (input: { uid: string; reason: string; displayName?: string; department?: string | null; attendingEvent?: 'yes' | 'no' | 'maybe'; status?: 'active' | 'disabled' }) =>
    adminCall<Ok>('adminUpdateUser', input),
  computeAwards: () => adminCall<Ok & { count: number }>('computeAwards'),
  adminStats: () => adminCall<SeasonStats>('adminStats'),
  importRoster: (rows: { email: string; name: string; department: string }[], replace = false) =>
    adminCall<Ok & { imported: number; activated: number }>('importRoster', { rows, replace }),
};
