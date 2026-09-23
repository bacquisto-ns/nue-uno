import { DEFAULT_SEASON_SETTINGS } from '@nue-uno/shared';
import { useDoc } from './firestore';

export const DEFAULT_SEASON_ID = 'connections-2026';

export interface SeasonView {
  id: string;
  status: 'setup' | 'qualifying' | 'locked' | 'event' | 'complete';
  bracketSize: number;
}

/** Current season (config/app.currentSeasonId → seasons/{id}), with safe defaults while loading. */
export function useSeason(): SeasonView {
  const config = useDoc<{ currentSeasonId?: string }>('config/app');
  const id = config.data?.currentSeasonId ?? DEFAULT_SEASON_ID;
  const season = useDoc<{ status?: SeasonView['status']; bracketSize?: number }>(`seasons/${id}`);
  return {
    id,
    status: season.data?.status ?? 'setup',
    bracketSize: season.data?.bracketSize ?? DEFAULT_SEASON_SETTINGS.bracketSize,
  };
}
