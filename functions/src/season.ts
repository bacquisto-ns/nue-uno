import { DEFAULT_SEASON_SETTINGS } from '@nue-uno/shared';
import { db } from './admin.js';

export const DEFAULT_SEASON_ID = 'connections-2026';

export type SeasonStatus = 'setup' | 'qualifying' | 'locked' | 'event' | 'complete';

type Settings = typeof DEFAULT_SEASON_SETTINGS;

export interface Season {
  id: string;
  status: SeasonStatus;
  qualifierStartMs: number | null;
  qualifierEndMs: number | null;
  pausedAtMs: number | null;
  timezone: string;
  timers: Settings['timers'];
  finalLap: Settings['finalLap'];
  scoring: {
    pointsByTableSize: Record<string, number[]>;
    bestN: number;
    minGames: number;
    maxSameGroupPerDay: number;
    minTurnsForPoints: number;
  };
}

let cache: { season: Season; at: number } | null = null;
const TTL_MS = 30_000;

/** Current season merged over defaults (config/app.currentSeasonId). Cached briefly per instance. */
export async function getSeason(options: { fresh?: boolean } = {}): Promise<Season> {
  if (!options.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.season;
  const config = (await db.doc('config/app').get()).data() ?? {};
  const id: string = config.currentSeasonId ?? DEFAULT_SEASON_ID;
  const doc = (await db.doc(`seasons/${id}`).get()).data() ?? {};
  const season: Season = {
    id,
    status: doc.status ?? 'setup',
    qualifierStartMs: doc.qualifierStart?.toMillis?.() ?? null,
    qualifierEndMs: doc.qualifierEnd?.toMillis?.() ?? null,
    pausedAtMs: doc.pausedAt?.toMillis?.() ?? null,
    timezone: doc.timezone ?? DEFAULT_SEASON_SETTINGS.timezone,
    timers: { ...DEFAULT_SEASON_SETTINGS.timers, ...doc.timers },
    finalLap: { ...DEFAULT_SEASON_SETTINGS.finalLap, ...doc.finalLap },
    scoring: {
      ...DEFAULT_SEASON_SETTINGS.scoring,
      ...doc.scoring,
      pointsByTableSize: {
        ...DEFAULT_SEASON_SETTINGS.scoring.pointsByTableSize,
        ...doc.scoring?.pointsByTableSize,
      },
    },
  };
  cache = { season, at: Date.now() };
  return season;
}

/** Tests change season docs between cases. */
export function clearSeasonCache(): void {
  cache = null;
}

export function qualifiersOpen(season: Season, nowMs: number): boolean {
  return (
    season.status === 'qualifying' &&
    season.qualifierStartMs !== null &&
    season.qualifierEndMs !== null &&
    nowMs >= season.qualifierStartMs &&
    nowMs < season.qualifierEndMs
  );
}
