import {
  applyAction,
  botAction,
  createGame,
  createRandom,
  splitState,
  type Action,
  type GameState,
} from '@nue-uno/engine';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/call';
import { useSession } from '../../auth/session';
import type { TableActions, TableViewModel } from '../../game/view';
import { Button, Panel, Screen } from '../../ui/primitives';
import type { FxEvent } from '../game/EffectsLayer';
import { TableView } from '../game/TableView';

const BOTS = [
  { uid: 'bot-botsy', displayName: 'Botsy', avatarId: 'octopus', avatarColor: 'violet' },
  { uid: 'bot-shark', displayName: 'Card Shark', avatarId: 'wolf', avatarColor: 'sky' },
  { uid: 'bot-willow', displayName: 'Wild Willow', avatarId: 'owl', avatarColor: 'lime' },
];
const ME = 'me';

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
  return <LocalTable key={botCount} botCount={botCount} onRestart={() => setBotCount(null)} />;
}

function LocalTable({ botCount, onRestart }: { botCount: number; onRestart: () => void }) {
  const profile = useSession((s) => s.profile);
  const bots = useMemo(() => BOTS.slice(0, botCount), [botCount]);
  const [seed] = useState(() => (Date.now() ^ 0x5eed) | 0);
  const random = useMemo(() => createRandom(seed ^ 0x9e37), [seed]);
  const [state, setState] = useState<GameState>(() => createGame([ME, ...bots.map((b) => b.uid)], seed).state);
  const [lastPlayedBy, setLastPlayedBy] = useState<string | null>(null);
  const [fx, setFx] = useState<FxEvent[]>([]);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

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
  }, []);

  // Bots think for 0.9–1.8 s, then act; they may also catch a forgotten UNO.
  useEffect(() => {
    if (state.phase === 'finished') return;
    const turnUid = state.players[state.turn]!;
    const catcher = bots.find((b) => state.unoPending && state.unoPending !== b.uid);
    const actor = turnUid.startsWith('bot-') ? turnUid : catcher?.uid;
    if (!actor) return;
    const delay = 900 + random() * 900;
    const timer = window.setTimeout(() => {
      const action = botAction(stateRef.current, actor, random);
      if (action) {
        try {
          apply(action);
        } catch {
          /* state moved on (e.g. the human acted first) — the effect will re-run */
        }
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [apply, bots, random, state]);

  const view: TableViewModel = useMemo(() => {
    const { publicDoc } = splitState(state);
    const names: Record<string, { displayName: string; avatarId: string; avatarColor: string }> = {
      [ME]: {
        displayName: profile?.displayName ?? 'You',
        avatarId: profile?.avatarId ?? 'fox',
        avatarColor: profile?.avatarColor ?? 'teal',
      },
      ...Object.fromEntries(bots.map((b) => [b.uid, b])),
    };
    return {
      myUid: ME,
      seats: state.players.map((uid) => ({
        uid,
        ...names[uid]!,
        cardCount: publicDoc.handCounts[uid] ?? 0,
        away: false,
        forfeited: state.forfeited.includes(uid),
        isBot: uid !== ME,
      })),
      myHand: state.hands[ME] ?? [],
      topCard: publicDoc.topCard,
      currentColor: state.currentColor,
      direction: state.direction,
      phase: state.phase,
      turnUid: publicDoc.turnUid,
      drawnCardId: state.drawnCardId,
      drawPileCount: publicDoc.drawPileCount,
      unoPending: state.unoPending,
      finalLap: state.finalLap,
      turnDeadlineMs: null,
      graceMs: 0,
      paused: false,
      mode: 'practice',
      status: state.phase === 'finished' ? 'finished' : 'in_progress',
      placements: state.placements,
      endedBy: state.endedBy,
      version: state.version,
      lastPlayedBy,
    };
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
      leave: async () => onRestart(),
    };
  }, [apply, onRestart]);

  return <TableView view={view} actions={actions} serverNow={Date.now} totalTurnMs={30_000} exitTo="/" events={fx} />;
}
