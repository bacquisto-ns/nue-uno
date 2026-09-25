import { EMOTES, type EmoteKey } from '@nue-uno/shared';
import { ref, serverTimestamp, set } from 'firebase/database';
import { AnimatePresence, m } from 'framer-motion';
import { useCallback, useState } from 'react';
import { play } from '../../audio/sound';
import { usePings } from '../../hooks/pings';
import type { EffectsMode } from '../../motion/effectsMode';
import { spring } from '../../motion/tokens';
import { rtdb } from '../../rtdb';

export const EMOTE_GLYPH: Record<EmoteKey, { glyph: string; label: string }> = {
  nice: { glyph: '👏', label: 'Nice' },
  lol: { glyph: '😂', label: 'LOL' },
  shock: { glyph: '😱', label: 'No way' },
  fire: { glyph: '🔥', label: 'Fire' },
  gg: { glyph: '🙏', label: 'GG' },
  evil: { glyph: '😈', label: 'Sorry, not sorry' },
  eyes: { glyph: '👀', label: 'Watching you' },
  salute: { glyph: '🫡', label: 'Respect' },
};

/** Matches the RTDB rule (one emote per 3 s per player), plus a little slack for clock skew. */
const COOLDOWN_MS = 3200;

/** The 😀 button and its 8-emote tray (PRD G12). Only seated players can send. */
export function EmoteButton({ gameId, uid, muted, onToggleMute }: { gameId: string; uid: string; muted: boolean; onToggleMute: () => void }) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);

  function send(e: EmoteKey) {
    if (cooling) return;
    setOpen(false);
    setCooling(true);
    window.setTimeout(() => setCooling(false), COOLDOWN_MS);
    // A rule rejection (too fast) is harmless: the emote just doesn't show.
    void set(ref(rtdb, `emotes/${gameId}/${uid}`), { e, at: serverTimestamp() }).catch(() => undefined);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Send an emote"
        className={`rounded-full bg-white/10 px-2 py-0.5 text-base leading-none hover:bg-white/20 ${cooling ? 'opacity-50' : ''}`}
      >
        😀
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={spring.snappy}
            className="absolute right-0 top-9 z-40 w-56 rounded-2xl bg-felt-900 p-2 shadow-2xl ring-1 ring-white/15"
            role="menu"
          >
            <div className="grid grid-cols-4 gap-1">
              {EMOTES.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="menuitem"
                  disabled={cooling}
                  onClick={() => send(k)}
                  title={EMOTE_GLYPH[k].label}
                  aria-label={EMOTE_GLYPH[k].label}
                  className="rounded-xl p-1 text-3xl hover:bg-white/10 disabled:opacity-40"
                >
                  {EMOTE_GLYPH[k].glyph}
                </button>
              ))}
            </div>
            <button type="button" onClick={onToggleMute} className="mt-2 w-full rounded-lg bg-white/5 py-1 text-xs text-ink-muted hover:bg-white/10">
              {muted ? "🔈 Show others' emotes" : "🔇 Mute others' emotes"}
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface Bubble {
  id: number;
  uid: string;
  key: EmoteKey;
}
let nextId = 1;

/**
 * Emote bubbles pop from the sender's seat (motion spec §5 "Emote"): `spring.bouncy`, float up
 * 24 px, gone after 1.8 s. Only emotes from people seated at this game are shown.
 */
export function EmoteBubbles({ gameId, seated, myUid, muted, mode }: { gameId: string; seated: string[]; myUid: string; muted: boolean; mode: EffectsMode }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const onPing = useCallback(
    (p: { uid: string; key: EmoteKey }) => {
      if (!seated.includes(p.uid) || (muted && p.uid !== myUid) || !(p.key in EMOTE_GLYPH)) return;
      const b = { id: nextId++, uid: p.uid, key: p.key };
      play('pop');
      setBubbles((cur) => [...cur.filter((x) => x.uid !== p.uid), b]);
      window.setTimeout(() => setBubbles((cur) => cur.filter((x) => x.id !== b.id)), 1800);
    },
    [muted, myUid, seated],
  );
  usePings<EmoteKey>(`emotes/${gameId}`, 'e', onPing);

  return (
    <div className="pointer-events-none fixed inset-0 z-30" aria-live="polite">
      <AnimatePresence>
        {bubbles.map((b) => {
          const el = document.querySelector(`[data-seat="${CSS.escape(b.uid)}"]`);
          const r = el?.getBoundingClientRect();
          if (!r) return null;
          const full = mode === 'full';
          // Seats along the top edge get their bubble underneath so it isn't clipped.
          const below = r.top < 90;
          return (
            <m.div
              key={b.id}
              className="absolute"
              style={{ left: r.left + r.width / 2, top: below ? r.bottom + 8 : r.top - 8 }}
              initial={full ? { scale: 0, opacity: 0, y: 0 } : { opacity: 0 }}
              animate={full ? { scale: 1, opacity: 1, y: below ? 24 : -24 } : { opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={full ? spring.bouncy : { duration: 0.15 }}
            >
              <div className={`-translate-x-1/2 rounded-2xl bg-white px-2 py-1 text-3xl shadow-xl ${below ? '' : '-translate-y-full'}`}>
                <span role="img" aria-label={EMOTE_GLYPH[b.key].label}>
                  {EMOTE_GLYPH[b.key].glyph}
                </span>
              </div>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
