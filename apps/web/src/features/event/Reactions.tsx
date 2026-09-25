import { REACTIONS, type ReactionKey } from '@nue-uno/shared';
import { ref, serverTimestamp, set } from 'firebase/database';
import { AnimatePresence, m } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import { buzz } from '../../audio/haptics';
import type { MatchView, PlayerCard } from '../../hooks/bracket';
import { usePings, type Ping } from '../../hooks/pings';
import { rtdb } from '../../rtdb';

export const REACTION_GLYPH: Record<ReactionKey, { glyph: string; label: string }> = {
  fire: { glyph: '🔥', label: 'Fire' },
  clap: { glyph: '👏', label: 'Applause' },
  shock: { glyph: '😱', label: 'No way' },
  party: { glyph: '🎉', label: 'Party' },
};

/** Rules allow one reaction per second per person (PRD E11); a hair more avoids rejections. */
const COOLDOWN_MS = 1100;

/** 🔥 👏 😱 🎉 for one target (a matchId, or "bracket" for the room in general). */
export function ReactionBar({ targetId, uid, big = false }: { targetId: string; uid: string; big?: boolean }) {
  const last = useRef(-COOLDOWN_MS);
  const [echo, setEcho] = useState<{ id: number; glyph: string }[]>([]);

  // Event timestamps (ms since page load) keep the cooldown pure — no clock reads in render.
  function react(r: ReactionKey, at: number) {
    if (at - last.current < COOLDOWN_MS) return;
    last.current = at;
    buzz('light');
    const e = { id: at, glyph: REACTION_GLYPH[r].glyph };
    setEcho((cur) => [...cur.slice(-4), e]);
    window.setTimeout(() => setEcho((cur) => cur.filter((x) => x.id !== e.id)), 900);
    void set(ref(rtdb, `reactions/${targetId}/${uid}`), { r, at: serverTimestamp() }).catch(() => undefined);
  }

  return (
    <div className="relative flex gap-2">
      {REACTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={(ev) => react(r, ev.timeStamp)}
          aria-label={REACTION_GLYPH[r].label}
          className={`rounded-full bg-white/10 ring-1 ring-white/10 transition active:scale-90 hover:bg-white/20 ${big ? 'px-4 py-2 text-3xl' : 'px-3 py-1 text-2xl'}`}
        >
          {REACTION_GLYPH[r].glyph}
        </button>
      ))}
      <AnimatePresence>
        {echo.map((e) => (
          <m.span
            key={e.id}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 text-3xl"
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            {e.glyph}
          </m.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Event Hub panel: cheer on the live tables, or the room in general between rounds. */
export function CheerPanel({ matches, directory, uid }: { matches: MatchView[]; directory: Record<string, PlayerCard>; uid: string }) {
  const live = matches.filter((mt) => mt.status === 'in_progress').sort((a, b) => a.physicalTable - b.physicalTable);
  return (
    <section className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10" aria-label="Cheer">
      <p className="font-display text-xl font-extrabold">📣 Cheer them on</p>
      {live.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">Your reactions float up on the big screen.</p>
          <ReactionBar targetId="bracket" uid={uid} big />
        </div>
      ) : (
        live.map((mt) => (
          <div key={mt.id} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <strong>Table {mt.physicalTable}</strong>{' '}
              <span className="text-ink-muted">
                {mt.slots
                  .filter(Boolean)
                  .map((s) => directory[s!]?.displayName ?? 'Player')
                  .join(' · ')}
              </span>
            </p>
            <ReactionBar targetId={mt.id} uid={uid} />
          </div>
        ))
      )}
    </section>
  );
}

// ---- TV ---------------------------------------------------------------------------------------

interface Floater {
  id: number;
  target: string;
  glyph: string;
  /** 0..1 horizontal jitter, deterministic from the id (no Math.random in app code). */
  lane: number;
}

/** Above this rate a target stops spawning emojis and shows a hype meter instead (motion spec §6). */
const HYPE_PER_SEC = 20;
const MAX_FLOATERS = 60;

function PingSource({ target, onPing }: { target: string; onPing: (target: string, p: Ping<ReactionKey>) => void }) {
  const cb = useCallback((p: Ping<ReactionKey>) => onPing(target, p), [onPing, target]);
  usePings<ReactionKey>(`reactions/${target}`, 'r', cb);
  return null;
}

let nextId = 1;

/**
 * TV crowd reactions (PRD E11): emojis rise with a wobble next to the table they're aimed at
 * (`[data-match]` on the bracket board) and fade over 2.5 s. Totals count up per table.
 */
export function ReactionLayer({ targets, onReaction }: { targets: string[]; onReaction?: () => void }) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [hype, setHype] = useState<Record<string, boolean>>({});
  const recent = useRef<Record<string, number[]>>({});
  const cool = useRef<Record<string, number>>({});

  const onPing = useCallback(
    (target: string, p: Ping<ReactionKey>) => {
      const glyph = REACTION_GLYPH[p.key]?.glyph;
      if (!glyph) return;
      onReaction?.();
      setTotals((t) => ({ ...t, [target]: (t[target] ?? 0) + 1 }));
      const now = Date.now();
      const times = (recent.current[target] = [...(recent.current[target] ?? []).filter((x) => now - x < 1000), now]);
      if (times.length > HYPE_PER_SEC) {
        // Hype meters cool off 2.5 s after the burst ends.
        setHype((h) => (h[target] ? h : { ...h, [target]: true }));
        window.clearTimeout(cool.current[target]);
        cool.current[target] = window.setTimeout(() => setHype((h) => ({ ...h, [target]: false })), 2500);
        return;
      }
      const id = nextId++;
      setFloaters((cur) => [...cur.slice(-(MAX_FLOATERS - 1)), { id, target, glyph, lane: ((id * 0.618) % 1) }]);
      window.setTimeout(() => setFloaters((cur) => cur.filter((f) => f.id !== id)), 2500);
    },
    [onReaction],
  );

  const rectOf = (target: string) => {
    const el = document.querySelector(`[data-match="${CSS.escape(target)}"]`);
    const r = el?.getBoundingClientRect();
    return r ?? { left: window.innerWidth * 0.8, top: window.innerHeight * 0.55, width: window.innerWidth * 0.15, height: window.innerHeight * 0.3, right: window.innerWidth * 0.95 };
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-20" aria-hidden>
      {targets.map((t) => (
        <PingSource key={t} target={t} onPing={onPing} />
      ))}
      <AnimatePresence>
        {floaters.map((f) => {
          const r = rectOf(f.target);
          const x = r.left + r.width * (0.55 + f.lane * 0.4);
          return (
            <m.span
              key={f.id}
              className="absolute text-[3vw]"
              style={{ left: x, top: r.top + r.height * 0.8 }}
              initial={{ y: 0, opacity: 0, scale: 0.6 }}
              animate={{ y: -r.height * 0.9, opacity: [0, 1, 1, 0], scale: 1, x: [0, 12, -12, 8, 0] }}
              transition={{ duration: 2.5, ease: 'easeOut' }}
            >
              {f.glyph}
            </m.span>
          );
        })}
      </AnimatePresence>
      {targets.map((t) => {
        const total = totals[t];
        if (!total) return null;
        const r = rectOf(t);
        const hot = !!hype[t];
        return (
          <div
            key={`total-${t}`}
            className={`absolute rounded-full px-3 py-1 text-[1.3vw] font-bold shadow-lg ring-1 ring-white/20 ${hot ? 'animate-pulse bg-card-red text-white' : 'bg-felt-900 text-ink'}`}
            style={{ left: r.left + r.width / 2, top: r.top, transform: 'translate(-50%, -50%)' }}
          >
            {hot ? '🔥 HYPE ' : '📣 '}
            {total}
          </div>
        );
      })}
    </div>
  );
}
