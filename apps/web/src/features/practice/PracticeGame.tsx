import {
  applyAction,
  botAction,
  createGame,
  createRandom,
  type Action,
  type BotLevel,
  type Card,
  type EngineEvent,
  type GameState,
} from '@nue-uno/engine';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/call';
import { useSession } from '../../auth/session';
import { localView, type LocalSeat } from '../../game/local';
import type { TableActions, TableViewModel } from '../../game/view';
import { Button, Panel, Screen } from '../../ui/primitives';
import type { FxEvent } from '../game/EffectsLayer';
import { TableView } from '../game/TableView';

const BOTS = [
  { uid: 'bot-botsy', displayName: 'Botsy', avatarId: 'octopus', avatarColor: 'violet' },
  { uid: 'bot-shark', displayName: 'Card Shark', avatarId: 'wolf', avatarColor: 'sky' },
  { uid: 'bot-willow', displayName: 'Wild Willow', avatarId: 'owl', avatarColor: 'lime' },
];
export const ME = 'me';

/**
 * Practice vs bots (PRD O3, architecture ADR-7): the same engine and table UI, run entirely in the
 * browser. Nothing is written to the server and it never counts for anything.
 */
export function PracticeGame() {
  const [botCount, setBotCount] = useState<number | null>(null);
  if (botCount === null) {
    return (
      <Screen>
        <Link to="/" className="text-ink-muted hover:text-ink">← Lobby</Link>
        <Panel className="space-y-4 text-center">
          <p className="font-display text-3xl font-extrabold">Practice vs bots 🤖</p>
          <p className="text-ink-muted">Warm up with the real rules. Nothing here counts.</p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <Button key={n} variant={n === 3 ? 'primary' : 'ghost'} onClick={() => setBotCount(n)}>
                {n} bot{n > 1 ? 's' : ''}
              </Button>
            ))}
          </div>
        </Panel>
      </Screen>
    );
  }
  return <LocalTable key={botCount} bots={BOTS.slice(0, botCount)} onLeave={() => setBotCount(null)} />;
}

export interface LocalTableProps {
  bots: readonly LocalSeat[];
  /** Stacked deck / hand size / dealer / bot level (tutorial); random otherwise. */
  setup?: { deck?: Card[]; handSize?: number; dealerIndex?: number; botLevel?: BotLevel };
  /** Extra UI over the table (the tutorial coach), given the current view and new events. */
  overlay?: (view: TableViewModel) => ReactNode;
  onEvents?: (events: EngineEvent[]) => void;
  onLeave: () => void;
  exitTo?: string;
}

/** A game run entirely by the in-browser engine: practice and the tutorial (ADR-7). */
export function LocalTable({ bots, setup, overlay, onEvents, onLeave, exitTo = '/' }: LocalTableProps) {
  const profile = useSession((s) => s.profile);
  const [seed] = useState(() => (Date.now() ^ 0x5eed) | 0);
  const random = useMemo(() => createRandom(seed ^ 0x9e37), [seed]);
  const [state, setState] = useState<GameState>(
    () =>
      createGame([ME, ...bots.map((b) => b.uid)], seed, {
        presetDeck: setup?.deck,
        dealerIndex: setup?.dealerIndex,
        rules: setup?.handSize ? { handSize: setup.handSize } : undefined,
      }).state,
  );
  const [lastPlayedBy, setLastPlayedBy] = useState<string | null>(null);
  const [fx, setFx] = useState<FxEvent[]>([]);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const eventsCb = useRef(onEvents);
  useLayoutEffect(() => {
    eventsCb.current = onEvents;
  });

  const apply = useCallback((action: Action): void => {
    const res = applyAction(stateRef.current, action);
    if (!res.ok) throw new ApiError(res.message, res.error, res.message);
    stateRef.current = res.state;
    const played = [...res.events].reverse().find((e) => e.type === 'card_played');
    if (played?.uid) setLastPlayedBy(played.uid);
    setFx((prev) => {
      let seq = prev.at(-1)?.seq ?? 0;
      return [...prev, ...res.events.map((e) => ({ ...e, seq: ++seq }))].slice(-12);
    });
    setState(res.state);
    eventsCb.current?.(res.events);
  }, []);

  // Bots think for 0.9–1.8 s, then act; normal bots may also catch a forgotten UNO.
  const level = setup?.botLevel ?? 'normal';
  useEffect(() => {
    if (state.phase === 'finished') return;
    const turnUid = state.players[state.turn]!;
    const catcher = level === 'normal' ? bots.find((b) => state.unoPending && state.unoPending !== b.uid) : undefined;
    const actor = turnUid.startsWith('bot-') ? turnUid : catcher?.uid;
    if (!actor) return;
    const delay = 900 + random() * 900;
    const timer = window.setTimeout(() => {
      const action = botAction(stateRef.current, actor, random, level);
      if (action) {
        try {
          apply(action);
        } catch {
          /* state moved on (e.g. the human acted first) — the effect will re-run */
        }
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [apply, bots, level, random, state]);

  const view: TableViewModel = useMemo(() => {
    const me: LocalSeat = {
      uid: ME,
      displayName: profile?.displayName ?? 'You',
      avatarId: profile?.avatarId ?? 'fox',
      avatarColor: profile?.avatarColor ?? 'teal',
    };
    return localView(state, ME, [me, ...bots], lastPlayedBy);
  }, [bots, lastPlayedBy, profile, state]);

  const actions: TableActions = useMemo(() => {
    const act = async (a: Action) => apply(a);
    return {
      play: (cardId, o) => act({ type: 'play', uid: ME, cardId, chosenColor: o.chosenColor, declareUno: o.declareUno }),
      draw: () => act({ type: 'draw', uid: ME }),
      pass: () => act({ type: 'pass', uid: ME }),
      chooseColor: (color) => act({ type: 'chooseColor', uid: ME, color }),
      callUno: () => act({ type: 'callUno', uid: ME }),
      catchUno: (targetUid) => act({ type: 'catchUno', uid: ME, targetUid }),
      leave: async () => onLeave(),
    };
  }, [apply, onLeave]);

  return <TableView view={view} actions={actions} serverNow={Date.now} totalTurnMs={30_000} exitTo={exitTo} events={fx} overlay={overlay?.(view)} />;
}
