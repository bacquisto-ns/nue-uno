import type { Card, Color } from '@nue-uno/engine';
import { DEFAULT_SEASON_SETTINGS } from '@nue-uno/shared';
import { collection, limit, orderBy, query, type Timestamp } from 'firebase/firestore';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameApi } from '../../api/game';
import { useSession } from '../../auth/session';
import type { TableActions, TableViewModel } from '../../game/view';
import { db, useDoc, useQuery } from '../../hooks/firestore';
import { useEffectsMode } from '../../motion/effectsMode';
import type { FxEvent } from './EffectsLayer';
import { TableView } from './TableView';

export interface GameDocData {
  status: 'lobby' | 'in_progress' | 'finished' | 'abandoned' | 'voided';
  mode: 'casual' | 'ranked' | 'bracket' | null;
  seats: { uid: string; displayName: string; avatarId: string; avatarColor: string; department: string | null }[];
  handCounts?: Record<string, number>;
  topCard?: Card | null;
  currentColor?: Color | null;
  direction?: 1 | -1;
  phase?: TableViewModel['phase'];
  turnUid?: string | null;
  drawPileCount?: number;
  unoPending?: string | null;
  away?: Record<string, boolean>;
  forfeited?: string[];
  finalLap?: TableViewModel['finalLap'];
  placements?: string[] | null;
  endedBy?: TableViewModel['endedBy'];
  turnDeadline?: Timestamp | null;
  turnMs?: number | null;
  paused?: boolean;
  version: number;
  updatedAt?: Timestamp;
}

const GRACE = DEFAULT_SEASON_SETTINGS.timers.graceMs;

// Emotes pull in the Realtime Database SDK, so they load after the table is on screen.
const EmoteButton = lazy(() => import('./Emotes').then((m) => ({ default: m.EmoteButton })));
const EmoteBubbles = lazy(() => import('./Emotes').then((m) => ({ default: m.EmoteBubbles })));

/**
 * Server-clock estimate: Firestore `updatedAt` is written by the server, so comparing it with
 * local arrival time gives a (conservative) skew. Deadlines are judged in server time (ADR-4).
 */
function useServerClock(updatedAt: Timestamp | undefined, pending: boolean) {
  const skew = useRef(0);
  useEffect(() => {
    if (updatedAt && !pending) skew.current = updatedAt.toMillis() - Date.now();
  }, [updatedAt, pending]);
  return useCallback(() => Date.now() + skew.current, []);
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function OnlineGame({ gameId, game, fromCache, pending }: { gameId: string; game: GameDocData; fromCache: boolean; pending: boolean }) {
  const { user, profile } = useSession();
  const uid = user!.uid;
  const hand = useDoc<{ cards: Card[]; drawnCardId: string | null }>(`games/${gameId}/hands/${uid}`);
  const recent = useQuery<FxEvent>(
    query(collection(db, `games/${gameId}/events`), orderBy('seq', 'desc'), limit(12)),
    `events-${gameId}`,
  );
  const serverNow = useServerClock(game.updatedAt, pending);
  const online = useOnline();
  const mode = useEffectsMode();
  const [emotesMuted, setEmotesMuted] = useState(() => profile?.settings?.emotesMuted ?? false);
  const seated = useMemo(() => game.seats.map((s) => s.uid), [game.seats]);
  const amSeated = seated.includes(uid);

  const lastPlayedBy = recent.data?.find((e) => e.type === 'card_played')?.uid ?? null;
  const fxEvents = useMemo(() => [...(recent.data ?? [])].sort((a, b) => a.seq - b.seq), [recent.data]);

  const view: TableViewModel = useMemo(
    () => ({
      myUid: uid,
      seats: game.seats.map((s) => ({
        ...s,
        cardCount: game.handCounts?.[s.uid] ?? 0,
        away: !!game.away?.[s.uid],
        forfeited: !!game.forfeited?.includes(s.uid),
      })),
      myHand: hand.data?.cards ?? [],
      topCard: game.topCard ?? null,
      currentColor: game.currentColor ?? null,
      direction: game.direction ?? 1,
      phase: game.phase ?? 'awaiting_play',
      turnUid: game.turnUid ?? null,
      drawnCardId: hand.data?.drawnCardId ?? null,
      drawPileCount: game.drawPileCount ?? 0,
      unoPending: game.unoPending ?? null,
      finalLap: game.finalLap ?? { active: false, remaining: [] },
      turnDeadlineMs: game.turnDeadline ? game.turnDeadline.toMillis() : null,
      graceMs: GRACE,
      paused: !!game.paused,
      mode: game.mode ?? 'casual',
      status: game.status === 'lobby' ? 'in_progress' : game.status,
      placements: game.placements ?? null,
      endedBy: game.endedBy ?? null,
      version: game.version,
      lastPlayedBy,
    }),
    [game, hand.data, lastPlayedBy, uid],
  );

  // Always act on the latest version (moves carry expectedVersion — api.md idempotency).
  const versionRef = useRef(game.version);
  useEffect(() => {
    versionRef.current = game.version;
  }, [game.version]);

  const actions: TableActions = useMemo(() => {
    const v = () => versionRef.current;
    const done = async () => {};
    return {
      play: (cardId, o) => gameApi.playCard(gameId, v(), cardId, o).then(done),
      draw: () => gameApi.drawCard(gameId, v()).then(done),
      pass: () => gameApi.passTurn(gameId, v()).then(done),
      chooseColor: (c) => gameApi.chooseColor(gameId, v(), c).then(done),
      callUno: () => gameApi.callUno(gameId, v()).then(done),
      catchUno: (t) => gameApi.catchUno(gameId, v(), t).then(done),
      leave: () => gameApi.leaveGame(gameId, v()).then(done),
    };
  }, [gameId]);

  // Timeout claims (ADR-4): once the deadline has passed (+1 s), any viewer asks the server to act.
  // The idle player's own device claims first; others add jitter to avoid piling on.
  const claimed = useRef<number | null>(null);
  useEffect(() => {
    if (game.status !== 'in_progress' || game.paused || !game.turnDeadline) return;
    const deadline = game.turnDeadline.toMillis();
    const jitter = game.turnUid === uid ? 0 : 400 + ((uid.charCodeAt(0) * 97 + uid.length * 31) % 1200);
    const timer = window.setInterval(() => {
      if (claimed.current === game.version) return;
      if (serverNow() >= deadline + 1000 + jitter) {
        claimed.current = game.version;
        gameApi.claimTimeout(gameId, game.version).catch((err: { reason?: string }) => {
          // STALE_STATE: someone else got there first. DEADLINE_NOT_REACHED: our clock estimate
          // ran fast — allow another try shortly.
          if (err.reason === 'DEADLINE_NOT_REACHED') {
            window.setTimeout(() => {
              if (claimed.current === game.version) claimed.current = null;
            }, 1500);
          }
        });
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [game.paused, game.status, game.turnDeadline, game.turnUid, game.version, gameId, serverNow, uid]);

  return (
    <TableView
      view={view}
      actions={actions}
      serverNow={serverNow}
      totalTurnMs={game.turnMs ?? DEFAULT_SEASON_SETTINGS.timers.casualMs}
      haptics={profile?.settings?.haptics ?? true}
      offline={!online || fromCache}
      events={fxEvents}
      headerExtras={
        amSeated && game.status === 'in_progress' ? (
          <Suspense fallback={null}>
            <EmoteButton gameId={gameId} uid={uid} muted={emotesMuted} onToggleMute={() => setEmotesMuted((x) => !x)} />
          </Suspense>
        ) : null
      }
      overlay={
        <Suspense fallback={null}>
          <EmoteBubbles gameId={gameId} seated={seated} myUid={uid} muted={emotesMuted} mode={mode} />
        </Suspense>
      }
    />
  );
}
