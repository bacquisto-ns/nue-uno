import { lazy, Suspense } from 'react';
import { useSeason } from '../../hooks/season';
import { Lobby } from '../lobby/Lobby';

const EventHub = lazy(() => import('../event/EventHub').then((m) => ({ default: m.EventHub })));

/** "/" is the lobby during qualifiers and the Event Hub on event day (PRD E2). */
export function HomeSwitch() {
  const season = useSeason();
  // Don't flash the lobby on event day while the season doc is still loading.
  if (season.loading) return null;
  if (season.status === 'event' || season.status === 'complete') {
    return (
      <Suspense fallback={null}>
        <EventHub />
      </Suspense>
    );
  }
  return <Lobby />;
}
