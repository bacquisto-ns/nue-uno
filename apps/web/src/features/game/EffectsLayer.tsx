import type { Card, Color } from '@nue-uno/engine';
import confetti from 'canvas-confetti';
import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cueFor } from '../../audio/cues';
import { buzz } from '../../audio/haptics';
import { play as playSound } from '../../audio/sound';
import { EventQueue } from '../../motion/EventQueue';
import type { EffectsMode } from '../../motion/effectsMode';
import { limits, spring } from '../../motion/tokens';
import { CARD_COLORS } from '../../ui/Card';

export interface FxEvent {
  seq: number;
  type: string;
  uid?: string;
  targetUid?: string;
  card?: Card;
  color?: Color;
  count?: number;
}

type Overlay =
  | { id: number; kind: 'burst'; color: Color }
  | { id: number; kind: 'shockwave' }
  | {
      id: number;
      kind: 'stamp';
      at: string;
      text: string;
      tone: 'red' | 'gold' | 'white';
      big?: boolean;
    }
  | { id: number; kind: 'reverse' }
  | { id: number; kind: 'banner'; text: string };

/** An overlay before it gets an id (Omit distributed over the union). */
type OverlaySpec = Overlay extends infer T ? (T extends Overlay ? Omit<T, 'id'> : never) : never;

/** Motion spec §5 durations (ms) for the signature moments this layer plays. */
function choreograph(e: FxEvent): {
  overlays: OverlaySpec[];
  ms: number;
  shake?: boolean;
  confetti?: boolean;
} {
  if (e.type === 'card_played' && e.card) {
    const v = e.card.value;
    const overlays: OverlaySpec[] = [];
    if (e.card.color === 'wild' && e.color) overlays.push({ kind: 'burst', color: e.color });
    if (v === 'wild4' && e.targetUid) {
      overlays.push(
        { kind: 'shockwave' },
        { kind: 'stamp', at: e.targetUid, text: '+4', tone: 'red', big: true },
      );
      return { overlays, ms: 1400, shake: true };
    }
    if (v === 'skip' && e.targetUid)
      overlays.push({ kind: 'stamp', at: e.targetUid, text: '🚫', tone: 'white' });
    if (v === 'draw2' && e.targetUid)
      overlays.push({ kind: 'stamp', at: e.targetUid, text: '+2', tone: 'red' });
    if (v === 'reverse' && !e.targetUid) overlays.push({ kind: 'reverse' });
    return { overlays, ms: overlays.length ? 700 : 0 };
  }
  if (e.type === 'uno_called' && e.uid)
    return {
      overlays: [{ kind: 'stamp', at: e.uid, text: 'UNO!', tone: 'gold', big: true }],
      ms: 900,
    };
  if (e.type === 'uno_caught' && e.targetUid) {
    return {
      overlays: [
        { kind: 'stamp', at: e.targetUid, text: 'CAUGHT!', tone: 'red', big: true },
        ...(e.uid
          ? [{ kind: 'stamp' as const, at: e.uid, text: '🎯', tone: 'white' as const }]
          : []),
      ],
      ms: 900,
    };
  }
  if (e.type === 'final_lap')
    return { overlays: [{ kind: 'banner', text: '🏁 FINAL LAP — one turn each' }], ms: 1400 };
  if (e.type === 'game_finished') return { overlays: [], ms: 200, confetti: true };
  return { overlays: [], ms: 0 };
}

/** Screen-space centre of a seat (data-seat) or the pile (data-anchor="pile"). */
function anchor(at: string): { x: number; y: number } {
  const el = document.querySelector(
    at === 'pile' ? '[data-anchor="pile"]' : `[data-seat="${CSS.escape(at)}"]`,
  );
  const r = el?.getBoundingClientRect();
  return r
    ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

let nextId = 1;

/**
 * Plays signature effects for new game events (motion spec §4–5). Events already present on mount
 * are history and never replayed; a backlog fast-forwards instead of piling up.
 */
export function EffectsLayer({
  events,
  mode,
  onShake,
  myUid,
  haptics = true,
}: {
  events: FxEvent[];
  mode: EffectsMode;
  onShake: () => void;
  /** Whose device this is: haptics only fire for moments that happen to me. */
  myUid?: string;
  haptics?: boolean;
}) {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [queue] = useState(
    () =>
      new EventQueue<FxEvent>({
        play: () => Promise.resolve(),
        fastForward: () => undefined,
      }),
  );
  const [baseline] = useState(() => Math.max(0, ...events.map((e) => e.seq)));

  // Rebind the queue's playback to the latest mode/callbacks.
  useEffect(() => {
    queue.configure({
      play: (e: FxEvent) => {
        // Sound and haptics follow their own settings, not the effects mode (PRD A6).
        const cue = cueFor(e);
        if (cue) {
          for (const snd of cue.sounds) playSound(snd.name, snd.delayMs);
          const mine = cue.hapticFor ? cue.hapticFor === myUid : e.uid === myUid || e.type === 'final_lap' || e.type === 'game_finished';
          if (cue.haptic && mine) buzz(cue.haptic, haptics);
        }
        if (mode === 'off') return Promise.resolve();
        const plan = choreograph(e);
        if (plan.shake && mode === 'full') onShake();
        if (plan.confetti && mode === 'full') {
          void confetti({
            particleCount: window.innerWidth < 640 ? limits.particlesPhone : 300,
            spread: 90,
            origin: { y: 0.6 },
            disableForReducedMotion: true,
          });
        }
        if (!plan.overlays.length) return new Promise<void>((r) => window.setTimeout(r, plan.ms));
        const added = plan.overlays.map((o) => ({ ...o, id: nextId++ }) as Overlay);
        setOverlays((cur) => [...cur, ...added]);
        return new Promise<void>((resolve) =>
          window.setTimeout(
            () => {
              setOverlays((cur) => cur.filter((o) => !added.includes(o)));
              resolve();
            },
            mode === 'reduced' ? 600 : plan.ms,
          ),
        );
      },
      fastForward: () => setOverlays([]),
    });
  }, [haptics, mode, myUid, onShake, queue]);

  useEffect(() => {
    queue.push(events.filter((e) => e.seq > baseline));
  }, [baseline, events, queue]);

  const full = mode === 'full';
  return (
    <div className="pointer-events-none fixed inset-0 z-30" aria-hidden>
      <AnimatePresence>
        {overlays.map((o) => {
          if (o.kind === 'banner') {
            return (
              <m.div
                key={o.id}
                className="absolute inset-x-0 top-1/3 flex justify-center"
                initial={full ? { x: '-110%' } : { opacity: 0 }}
                animate={full ? { x: '0%' } : { opacity: 1 }}
                exit={full ? { x: '110%' } : { opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <div
                  className="font-display rounded-2xl px-10 py-4 text-4xl font-extrabold text-felt-950 shadow-2xl sm:text-6xl"
                  style={{
                    background:
                      'repeating-conic-gradient(#fff 0 25%, #e8eef6 0 50%) 50% / 28px 28px',
                  }}
                >
                  {o.text}
                </div>
              </m.div>
            );
          }
          const pos = anchor(o.kind === 'stamp' ? o.at : 'pile');
          if (o.kind === 'burst') {
            return (
              <m.div
                key={o.id}
                className="absolute"
                style={{ left: pos.x, top: pos.y }}
                initial={{ scale: 0, rotate: -90, opacity: 1 }}
                animate={{ scale: full ? [0, 1.25, 1] : 1, rotate: 0, opacity: [1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: full ? 0.6 : 0.2, times: [0, 0.5, 1] }}
              >
                <div className="-translate-x-1/2 -translate-y-1/2">
                  <svg width="220" height="220" viewBox="-110 -110 220 220">
                    {(['red', 'yellow', 'green', 'blue'] as Color[]).map((c, i) => (
                      <path
                        key={c}
                        d="M0 0 L 100 0 A 100 100 0 0 1 0 100 Z"
                        transform={`rotate(${i * 90})`}
                        fill={CARD_COLORS[c].fill}
                        opacity={c === o.color ? 1 : 0.25}
                      />
                    ))}
                    <circle r="36" fill="#0b1a2b" />
                  </svg>
                </div>
              </m.div>
            );
          }
          if (o.kind === 'shockwave') {
            return full ? (
              <m.div
                key={o.id}
                className="absolute rounded-full border-4 border-white/80"
                style={{ left: pos.x - 60, top: pos.y - 60, width: 120, height: 120 }}
                initial={{ scale: 0.3, opacity: 1 }}
                animate={{ scale: 6, opacity: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            ) : null;
          }
          if (o.kind === 'reverse') {
            return (
              <m.div
                key={o.id}
                className="absolute text-7xl text-white/90 drop-shadow-lg"
                style={{ left: pos.x, top: pos.y }}
                initial={{ rotate: 0, opacity: 0, x: '-50%', y: '-50%' }}
                animate={{ rotate: full ? 180 : 0, opacity: [0, 1, 0] }}
                transition={{ duration: 0.6 }}
              >
                ⇄
              </m.div>
            );
          }
          // stamp
          const color =
            o.tone === 'red'
              ? 'var(--color-card-red)'
              : o.tone === 'gold'
                ? 'var(--color-gold)'
                : '#fff';
          return (
            <m.div
              key={o.id}
              className="absolute"
              style={{ left: pos.x, top: pos.y }}
              initial={full ? { scale: 2.4, opacity: 0, rotate: -14 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: full ? -8 : 0 }}
              exit={{ opacity: 0, scale: full ? 0.8 : 1 }}
              transition={full ? spring.bouncy : { duration: 0.2 }}
            >
              <div
                className={`font-display -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl px-3 py-1 font-extrabold shadow-2xl ${o.big ? 'text-5xl' : 'text-3xl'}`}
                style={{
                  color: o.tone === 'white' ? '#0b1a2b' : '#fff',
                  background: color,
                  border: '3px solid #fff',
                }}
              >
                {o.text}
              </div>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
