import type { Card as CardModel, Color } from '@nue-uno/engine';
import { AnimatePresence, m } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/call';
import {
  myOptions,
  seatsFromMe,
  sortHand,
  whyNotPlayable,
  type SeatView,
  type TableActions,
  type TableViewModel,
} from '../../game/view';
import { useEffectsMode } from '../../motion/effectsMode';
import { useFpsGovernor } from '../../motion/fpsGovernor';
import { dur, ease, spring, stagger } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';
import { Card, CARD_COLORS, cardLabel, ColorShape } from '../../ui/Card';
import { Button } from '../../ui/primitives';
import { ColorPicker } from './ColorPicker';
import { TurnRing } from './TurnRing';

const CARD_W = 84;
type Pos = 'top' | 'left' | 'right' | 'topLeft' | 'topRight';

function layoutFor(n: number): Pos[] {
  if (n <= 1) return ['top'];
  if (n === 2) return ['topLeft', 'topRight'];
  return ['left', 'top', 'right'];
}

const POS_CLASS: Record<Pos, string> = {
  top: 'left-1/2 top-2 -translate-x-1/2',
  left: 'left-2 top-1/3 sm:left-6',
  right: 'right-2 top-1/3 sm:right-6',
  topLeft: 'left-[18%] top-2 -translate-x-1/2',
  topRight: 'right-[18%] top-2 translate-x-1/2',
};

/** Where a thrown card starts from, relative to the pile (X3). */
const FROM: Record<Pos | 'me', { x: number; y: number }> = {
  me: { x: 0, y: 320 },
  top: { x: 0, y: -260 },
  left: { x: -320, y: -40 },
  right: { x: 320, y: -40 },
  topLeft: { x: -220, y: -240 },
  topRight: { x: 220, y: -240 },
};

/** Stable "random" tilt per card so the pile looks naturally messy. */
function tilt(id: string): { rotate: number; x: number; y: number } {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const r = (n: number) => (((h >>> n) & 0xff) / 255 - 0.5);
  return { rotate: r(0) * 30, x: r(8) * 14, y: r(16) * 10 };
}

function fanPosition(i: number, n: number) {
  const offset = i - (n - 1) / 2;
  const spread = Math.min(7, 42 / Math.max(n, 1));
  const gap = Math.min(CARD_W * 0.62, 460 / Math.max(n, 1));
  return { x: offset * gap, y: Math.abs(offset) ** 1.6 * 2.2, rotate: offset * spread };
}

export interface TableViewProps {
  view: TableViewModel;
  actions: TableActions;
  serverNow: () => number;
  totalTurnMs: number;
  haptics?: boolean;
  /** Shown when the network is down (G6). */
  offline?: boolean;
  exitTo?: string;
}

export function TableView({ view, actions, serverNow, totalTurnMs, haptics = true, offline, exitTo = '/' }: TableViewProps) {
  const mode = useEffectsMode();
  useFpsGovernor(mode === 'full');
  const full = mode === 'full';
  const t = useCallback(
    (anim: object) => (mode === 'full' ? anim : mode === 'reduced' ? { duration: 0.15 } : { duration: 0 }),
    [mode],
  );

  const opts = myOptions(view);
  const hand = useMemo(() => sortHand(view.myHand), [view.myHand]);
  const [selected, setSelected] = useState<string | null>(null);
  const [declareUno, setDeclareUno] = useState(false);
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Pile history: remember the last few top cards we've seen for the messy-stack look.
  const [pile, setPile] = useState<{ card: CardModel; by: string | null }[]>([]);
  if (view.topCard && pile.at(-1)?.card.id !== view.topCard.id) {
    setPile((p) => [...p.slice(-4), { card: view.topCard!, by: view.lastPlayedBy }]);
  }

  // New cards fly in from the deck (X4). Cards already present on first render only animate
  // when the game has just been dealt (X1) — not when someone reloads mid-game.
  const dealing = view.version <= 1;

  const others = seatsFromMe(view).slice(1);
  const positions = layoutFor(others.length);
  const posOf = (uid: string | null): Pos | 'me' => {
    if (!uid || uid === view.myUid) return 'me';
    const i = others.findIndex((s) => s.uid === uid);
    return positions[i] ?? 'top';
  };

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3200);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
      } catch (err) {
        const reason = err instanceof ApiError ? err.reason : undefined;
        if (reason !== 'STALE_STATE') {
          flash(err instanceof ApiError ? (err.hint ?? err.message) : 'Something went wrong — try again.');
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, flash],
  );

  const playCard = useCallback(
    (card: CardModel, chosenColor?: Color) => {
      if (card.color === 'wild' && !chosenColor) {
        setPendingWild(card.id);
        return;
      }
      const declare = declareUno && hand.length === 2;
      setSelected(null);
      setDeclareUno(false);
      void run(() => actions.play(card.id, { chosenColor, declareUno: declare }));
    },
    [actions, declareUno, hand.length, run],
  );

  const tapCard = useCallback(
    (card: CardModel) => {
      if (!opts.playable.has(card.id)) {
        setSelected(card.id);
        flash(whyNotPlayable(view, card) ?? '');
        return;
      }
      if (selected === card.id) playCard(card);
      else setSelected(card.id);
    },
    [flash, opts.playable, playCard, selected, view],
  );

  // Keyboard play (PRD G8): ←/→ select, Enter play, D draw, P pass, U UNO.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pendingWild || e.target instanceof HTMLInputElement) return;
      const idx = hand.findIndex((c) => c.id === selected);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const next = e.key === 'ArrowRight' ? Math.min(hand.length - 1, idx + 1) : Math.max(0, idx - 1);
        setSelected(hand[next === -1 ? 0 : next]?.id ?? null);
        e.preventDefault();
      } else if (e.key === 'Enter' && idx >= 0) {
        const card = hand[idx]!;
        if (opts.playable.has(card.id)) playCard(card);
        else flash(whyNotPlayable(view, card) ?? '');
      } else if (e.key.toLowerCase() === 'd' && opts.canDraw) {
        void run(actions.draw);
      } else if (e.key.toLowerCase() === 'p' && opts.canPass) {
        void run(actions.pass);
      } else if (e.key.toLowerCase() === 'u') {
        if (opts.canCallUno) void run(actions.callUno);
        else if (opts.unoOnPlay) setDeclareUno((d) => !d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, flash, hand, opts, pendingWild, playCard, run, selected, view]);

  const tint = view.currentColor
    ? `color-mix(in srgb, ${CARD_COLORS[view.currentColor].fill} 22%, transparent)`
    : 'transparent';
  const turnName = view.seats.find((s) => s.uid === view.turnUid)?.displayName;
  const finished = view.status !== 'in_progress';

  return (
    <main className="felt-grain relative flex h-dvh flex-col overflow-hidden select-none">
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ background: `radial-gradient(ellipse at 50% 42%, ${tint}, transparent 65%)` }}
        transition={t({ duration: dur.emphasis })}
      />

      {/* Header */}
      <header className="relative z-20 flex items-center gap-3 px-3 py-2 text-sm">
        <button onClick={() => (finished ? null : setConfirmLeave(true))} className="text-ink-muted hover:text-ink" disabled={finished}>
          ✕ Leave
        </button>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide">{view.mode}</span>
        {view.finalLap.active && (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-felt-950">🏁 FINAL LAP</span>
        )}
        {view.paused && <span className="rounded-full bg-card-yellow px-2 py-0.5 text-xs font-bold text-felt-950">PAUSED</span>}
        {offline && <span className="rounded-full bg-card-red/80 px-2 py-0.5 text-xs font-bold">Reconnecting…</span>}
        <span className="ml-auto" aria-live="polite">
          {finished ? 'Game over' : opts.isMyTurn ? <strong className="text-gold">Your turn</strong> : `${turnName ?? '…'}'s turn`}
        </span>
      </header>

      {/* Table */}
      <section className="relative z-10 flex-1">
        {others.map((seat, i) => (
          <div key={seat.uid} className={`absolute ${POS_CLASS[positions[i]!]}`}>
            <SeatBadge
              seat={seat}
              isTurn={view.turnUid === seat.uid && !finished}
              unoPending={view.unoPending === seat.uid}
              lastTurn={view.finalLap.active && view.finalLap.remaining.includes(seat.uid)}
              deadlineMs={view.turnUid === seat.uid ? view.turnDeadlineMs : null}
              graceMs={view.graceMs}
              totalMs={totalTurnMs}
              serverNow={serverNow}
              catchable={opts.catchable.includes(seat.uid)}
              onCatch={() => void run(() => actions.catchUno(seat.uid))}
              full={full}
            />
          </div>
        ))}

        {/* Center: deck, pile, color */}
        <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-6 sm:gap-10">
          <button
            onClick={() => opts.canDraw && void run(actions.draw)}
            disabled={!opts.canDraw || busy}
            aria-label={`Draw a card (${view.drawPileCount} left)`}
            className={`relative rounded-[10px] ${opts.canDraw ? 'cursor-pointer ring-4 ring-gold/70' : ''}`}
          >
            {[2, 1].map((i) => (
              <div key={i} className="absolute" style={{ top: -i * 2, left: -i * 2 }}>
                <Card faceDown width={CARD_W} />
              </div>
            ))}
            <Card faceDown width={CARD_W} className="relative" />
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-ink-muted">{view.drawPileCount}</span>
          </button>

          <div className="relative" style={{ width: CARD_W, height: CARD_W * 1.5 }} aria-label={view.topCard ? `Top card: ${cardLabel(view.topCard)}` : 'Discard pile'} role="img">
            <AnimatePresence initial={false}>
              {pile.map(({ card, by }, i) => {
                const rest = tilt(card.id);
                const from = FROM[posOf(by)];
                const isTop = i === pile.length - 1;
                return (
                  <m.div
                    key={card.id}
                    className="absolute inset-0 drop-shadow-xl"
                    initial={full ? { x: from.x, y: from.y, rotate: rest.rotate - 40, scale: 1.1, opacity: 0.9 } : { opacity: 0 }}
                    animate={{ ...rest, scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={t({ duration: dur.standard, ease: ease.throw })}
                    style={{ zIndex: i, filter: isTop ? undefined : 'brightness(0.8)' }}
                  >
                    <Card card={card} width={CARD_W} />
                  </m.div>
                );
              })}
            </AnimatePresence>
          </div>

          {view.currentColor && (
            <m.div
              key={view.currentColor}
              initial={full ? { scale: 0.4, rotate: -120 } : false}
              animate={{ scale: 1, rotate: 0 }}
              transition={t(spring.bouncy)}
              className="flex flex-col items-center gap-1 text-sm"
            >
              <span
                className="grid h-12 w-12 place-items-center rounded-full ring-2 ring-white/40"
                style={{ background: CARD_COLORS[view.currentColor].fill, color: CARD_COLORS[view.currentColor].ink }}
              >
                <ColorShape color={view.currentColor} size={18} />
              </span>
              <span className="font-semibold">{CARD_COLORS[view.currentColor].label}</span>
              <span className="text-xs text-ink-muted" aria-label={view.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}>
                {view.direction === 1 ? '↻' : '↺'}
              </span>
            </m.div>
          )}
        </div>

        {/* My seat + controls */}
        <div className="absolute bottom-[190px] left-1/2 flex -translate-x-1/2 items-center gap-3 sm:bottom-[210px]">
          <MySeat
            view={view}
            opts={opts}
            serverNow={serverNow}
            totalMs={totalTurnMs}
            haptics={haptics}
          />
          <AnimatePresence>
            {opts.unoOnPlay && (
              <m.button
                key="uno-toggle"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={spring.bouncy}
                onClick={() => setDeclareUno((d) => !d)}
                aria-pressed={declareUno}
                className={`font-display rounded-2xl px-4 py-2 text-2xl font-extrabold shadow-lg ${declareUno ? 'bg-gold text-felt-950' : 'bg-card-red text-white animate-[uno-pulse_1.2s_infinite]'}`}
              >
                {declareUno ? 'UNO! ✓' : 'UNO!'}
              </m.button>
            )}
            {opts.canCallUno && (
              <m.button
                key="uno-call"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                onClick={() => void run(actions.callUno)}
                className="font-display animate-[uno-pulse_1.2s_infinite] rounded-2xl bg-card-red px-4 py-2 text-2xl font-extrabold text-white"
              >
                Call UNO!
              </m.button>
            )}
          </AnimatePresence>
          {opts.canDraw && opts.playable.size === 0 && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm" role="status">
              No match — tap the deck to draw
            </span>
          )}
          {opts.canPass && (
            <Button variant="ghost" onClick={() => void run(actions.pass)} disabled={busy}>
              Pass
            </Button>
          )}
        </div>
      </section>

      {/* My hand (X2 fan, X1 deal, X4 draw) */}
      <section className="relative z-10 flex h-[190px] items-end justify-center pb-12 sm:h-[210px]" aria-label="Your hand">
        <div className="relative h-36" style={{ width: CARD_W }}>
          <AnimatePresence initial={dealing}>
            {hand.map((card, i) => {
              const pos = fanPosition(i, hand.length);
              const playable = opts.playable.has(card.id);
              const isSel = selected === card.id;
              return (
                <m.button
                  key={card.id}
                  onClick={() => tapCard(card)}
                  aria-label={`${cardLabel(card)}${playable ? ', playable' : ''}`}
                  aria-pressed={isSel}
                  className="absolute bottom-0 left-0 origin-bottom"
                  style={{ zIndex: isSel ? 100 : i }}
                  initial={full ? { x: -150, y: -330, rotate: -20, rotateY: 180, opacity: 0 } : false}
                  animate={{
                    x: pos.x,
                    y: pos.y - (isSel ? 28 : playable ? 12 : 0),
                    rotate: pos.rotate,
                    rotateY: 0,
                    scale: isSel ? 1.06 : 1,
                    opacity: 1,
                  }}
                  exit={full ? { y: -260, opacity: 0, scale: 0.9, transition: { duration: dur.quick } } : { opacity: 0 }}
                  transition={t({ ...spring.snappy, delay: dealing ? i * stagger.deal : 0 })}
                >
                  <div
                    className="rounded-[10px]"
                    style={{
                      boxShadow: playable && view.currentColor ? `0 0 16px 2px ${CARD_COLORS[view.currentColor].fill}` : '0 8px 16px #0006',
                    }}
                  >
                    <Card card={card} width={CARD_W} dimmed={opts.isMyTurn && !playable} />
                  </div>
                </m.button>
              );
            })}
          </AnimatePresence>
        </div>
      </section>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <m.div
            role="status"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-4 left-1/2 z-40 max-w-sm -translate-x-1/2 rounded-xl bg-felt-950/95 px-4 py-3 text-center text-sm shadow-2xl ring-1 ring-white/15"
          >
            {toast}
          </m.div>
        )}
      </AnimatePresence>

      {(pendingWild || opts.mustChooseColor) && (
        <ColorPicker
          onPick={(color) => {
            if (opts.mustChooseColor) {
              void run(() => actions.chooseColor(color));
            } else {
              const card = hand.find((c) => c.id === pendingWild);
              setPendingWild(null);
              if (card) playCard(card, color);
            }
          }}
          onCancel={opts.mustChooseColor ? undefined : () => setPendingWild(null)}
        />
      )}

      {confirmLeave && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal>
          <div className="max-w-sm rounded-3xl bg-felt-900 p-6 text-center ring-1 ring-white/10">
            <p className="font-display text-2xl font-extrabold">Leave this game?</p>
            <p className="mt-2 text-ink-muted">Leaving counts as a forfeit — you'll finish last.</p>
            <div className="mt-5 flex justify-center gap-3">
              <Button variant="ghost" onClick={() => setConfirmLeave(false)}>Stay</Button>
              <Button onClick={() => { setConfirmLeave(false); void run(actions.leave); }}>Leave game</Button>
            </div>
          </div>
        </div>
      )}

      {finished && <Results view={view} exitTo={exitTo} full={full} />}
    </main>
  );
}

function SeatBadge({
  seat,
  isTurn,
  unoPending,
  lastTurn,
  deadlineMs,
  graceMs,
  totalMs,
  serverNow,
  catchable,
  onCatch,
  full,
}: {
  seat: SeatView;
  isTurn: boolean;
  unoPending: boolean;
  lastTurn: boolean;
  deadlineMs: number | null;
  graceMs: number;
  totalMs: number;
  serverNow: () => number;
  catchable: boolean;
  onCatch: () => void;
  full: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-1 ${seat.forfeited ? 'opacity-40' : ''}`}>
      <div className="relative" style={seat.cardCount === 1 ? { animation: 'uno-pulse 1.6s infinite', borderRadius: 9999 } : undefined}>
        <Avatar avatarId={seat.avatarId} color={seat.avatarColor} size={52} label={seat.displayName} />
        {isTurn && <TurnRing deadlineMs={deadlineMs} graceMs={graceMs} totalMs={totalMs} serverNow={serverNow} size={52} isMe={false} haptics={false} />}
        <m.span
          key={seat.cardCount}
          initial={full ? { scale: 1.6 } : false}
          animate={{ scale: 1 }}
          transition={spring.bouncy}
          className="absolute -bottom-1 -right-2 grid h-7 min-w-7 place-items-center rounded-full bg-white px-1.5 text-sm font-bold text-felt-950 shadow"
          aria-label={`${seat.cardCount} cards`}
        >
          {seat.cardCount}
        </m.span>
      </div>
      <span className="max-w-24 truncate text-sm font-semibold">{seat.displayName}</span>
      <div className="flex gap-1 text-[10px] font-bold uppercase">
        {seat.away && <span className="rounded bg-white/15 px-1">Away</span>}
        {seat.forfeited && <span className="rounded bg-white/15 px-1">Left</span>}
        {lastTurn && <span className="rounded bg-white px-1 text-felt-950">Last turn</span>}
        {unoPending && <span className="rounded bg-card-red px-1">No UNO!</span>}
      </div>
      {catchable && (
        <m.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={spring.bouncy}
          onClick={onCatch}
          className="font-display rounded-xl bg-card-red px-3 py-1 font-extrabold text-white shadow-lg"
        >
          Catch! 🎯
        </m.button>
      )}
    </div>
  );
}

function MySeat({
  view,
  opts,
  serverNow,
  totalMs,
  haptics,
}: {
  view: TableViewModel;
  opts: ReturnType<typeof myOptions>;
  serverNow: () => number;
  totalMs: number;
  haptics: boolean;
}) {
  const me = view.seats.find((s) => s.uid === view.myUid);
  if (!me) return null;
  return (
    <div className="relative" title="You">
      <Avatar avatarId={me.avatarId} color={me.avatarColor} size={44} label={`${me.displayName} (you)`} />
      {opts.isMyTurn && (
        <TurnRing deadlineMs={view.turnDeadlineMs} graceMs={view.graceMs} totalMs={totalMs} serverNow={serverNow} size={44} isMe haptics={haptics} />
      )}
    </div>
  );
}

function Results({ view, exitTo, full }: { view: TableViewModel; exitTo: string; full: boolean }) {
  const order = view.placements ?? [];
  const seatOf = (uid: string) => view.seats.find((s) => s.uid === uid);
  const iWon = order[0] === view.myUid;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Results">
      <m.div
        initial={full ? { scale: 0.8, y: 40, opacity: 0 } : { opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={spring.bouncy}
        className="w-full max-w-sm rounded-3xl bg-felt-900 p-6 text-center ring-1 ring-white/10"
      >
        <p className="font-display text-4xl font-extrabold">{view.status === 'finished' ? (iWon ? 'YOU WIN! 🎉' : 'Game over') : 'Game ended'}</p>
        {view.endedBy === 'final_lap' && <p className="mt-1 text-sm text-ink-muted">🏁 Decided on the Final Lap</p>}
        <ol className="mt-5 space-y-2 text-left">
          {order.map((uid, i) => {
            const s = seatOf(uid);
            return (
              <m.li
                key={uid}
                initial={full ? { x: -30, opacity: 0 } : false}
                animate={{ x: 0, opacity: 1 }}
                transition={{ ...spring.soft, delay: 0.2 + i * 0.12 }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${uid === view.myUid ? 'bg-gold/15 ring-1 ring-gold/50' : 'bg-white/5'}`}
              >
                <span className="font-display w-6 text-xl font-extrabold">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                {s && <Avatar avatarId={s.avatarId} color={s.avatarColor} size={32} label="" />}
                <span className="font-semibold">{s?.displayName ?? uid}</span>
                <span className="ml-auto text-sm text-ink-muted">{s?.forfeited ? 'left' : `${s?.cardCount ?? 0} cards`}</span>
              </m.li>
            );
          })}
        </ol>
        <Link to={exitTo} className="mt-6 block">
          <Button className="w-full">Back to lobby</Button>
        </Link>
      </m.div>
    </div>
  );
}
