import type { Card as CardModel, Color } from '@nue-uno/engine';
import confetti from 'canvas-confetti';
import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useState } from 'react';
import { play } from '../../audio/sound';
import type { BracketView, MatchView, PlayerCard } from '../../hooks/bracket';
import { useDoc } from '../../hooks/firestore';
import { spring } from '../../motion/tokens';
import { Avatar } from '../../ui/Avatar';
import { Card } from '../../ui/Card';
import { BracketBoard } from '../event/BracketBoard';

export type DirectoryCard = PlayerCard;

interface Entry {
  score?: number;
  wins?: number;
  rankedGames?: number;
}

const COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];

/** A signature card is just a value; give it a stable colour per player. */
function signature(uid: string, value: string | null | undefined): CardModel | null {
  if (!value) return null;
  const wild = value === 'wild' || value === 'wild4';
  const color = wild ? 'wild' : COLORS[[...uid].reduce((a, c) => a + c.charCodeAt(0), 0) % 4]!;
  return { id: `sig-${uid}`, color, value } as CardModel;
}

/** Name typed out one letter at a time (Selection Show "name typed out"). */
function TypeOut({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span aria-label={text}>
      {[...text].map((ch, i) => (
        <m.span key={i} aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + i * 0.06 }}>
          {ch}
        </m.span>
      ))}
    </span>
  );
}

// ---- Player Intros (PRD E8) --------------------------------------------------------------------

function IntroCard({ uid, index, seed, seasonId, card }: { uid: string; index: number; seed?: number; seasonId: string; card?: DirectoryCard }) {
  const entry = useDoc<Entry>(`leaderboard/${seasonId}/entries/${uid}`).data;
  const sig = signature(uid, card?.signatureCard);
  const fromLeft = index % 2 === 0;
  useEffect(() => play('stamp-soft', index * 400 + 250), [index]);
  return (
    <m.article
      initial={{ x: fromLeft ? '-120vw' : '120vw', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ ...spring.soft, delay: index * 0.4 }}
      className="relative flex items-center gap-[2vw] overflow-hidden rounded-[1.5vw] bg-felt-900/90 p-[1.5vw] ring-2 ring-white/15"
    >
      {/* Light-sweep glint */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
        initial={{ left: '-40%' }}
        animate={{ left: '140%' }}
        transition={{ delay: index * 0.4 + 0.6, duration: 1.1, ease: 'easeInOut' }}
      />
      <Avatar avatarId={card?.avatarId ?? 'fox'} color={card?.avatarColor ?? 'teal'} size={150} label="" />
      <div className="min-w-0 flex-1">
        {seed && <p className="font-display text-[1.8vw] font-extrabold text-gold">SEED #{seed}</p>}
        <p className="font-display truncate text-[3.6vw] font-extrabold leading-none">{card?.displayName ?? 'Player'}</p>
        {card?.department && <p className="text-[1.6vw] text-ink-muted">{card.department}</p>}
        {entry && (
          <p className="mt-[0.5vw] text-[1.6vw] font-semibold">
            {entry.score ?? 0} pts · {entry.wins ?? 0} wins in {entry.rankedGames ?? 0} games
          </p>
        )}
      </div>
      {sig && (
        <div className="shrink-0 -rotate-6">
          <Card card={sig} width={110} />
          <p className="mt-1 text-center text-[1vw] uppercase tracking-widest text-ink-muted">Signature</p>
        </div>
      )}
    </m.article>
  );
}

/** Walk-out cards for the players at one table: slide in from alternating sides, 400 ms apart. */
export function PlayerIntros({ match, bracket, directory, seasonId }: { match: MatchView | null; bracket: BracketView; directory: Record<string, DirectoryCard>; seasonId: string }) {
  if (!match) {
    return (
      <div className="grid h-full place-items-center">
        <p className="font-display text-[4vw] font-extrabold">Next table coming up…</p>
      </div>
    );
  }
  const seedOf = Object.fromEntries(bracket.seeds.map((s) => [s.uid, s.seed]));
  const players = match.slots.filter((s): s is string => !!s);
  return (
    <div className="flex h-full flex-col gap-[1.5vw]">
      <m.h2 initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-display text-[3.5vw] font-extrabold text-gold">
        {match.roundName} · Table {match.physicalTable}
      </m.h2>
      <div className="grid flex-1 grid-cols-2 content-center gap-[1.5vw]">
        {players.map((uid, i) => (
          <IntroCard key={`${match.id}-${uid}`} uid={uid} index={i} seed={seedOf[uid]} seasonId={seasonId} card={directory[uid]} />
        ))}
      </div>
    </div>
  );
}

// ---- Selection Show (PRD E9) -------------------------------------------------------------------

/**
 * The seeded bracket revealed one player at a time, bottom seed first. The admin steps it with
 * Next (tv/state.selectionStep): 0 = title card, k = k seeds revealed, size + 1 = the finale where
 * the whole bracket assembles.
 */
export function SelectionShow({ step, bracket, matches, directory }: { step: number; bracket: BracketView; matches: Record<string, MatchView>; directory: Record<string, DirectoryCard> }) {
  const n = bracket.seeds.length;
  const finale = step > n;
  const revealed = Math.min(step, n);
  const current = step >= 1 && step <= n ? bracket.seeds.find((s) => s.seed === n - step + 1) : undefined;
  // The top 4 seeds get longer suspense (motion spec §6).
  const suspenseMs = current && current.seed <= 4 ? 2600 : 1300;
  const [flipped, setFlipped] = useState<number | null>(null);
  const currentSeed = current?.seed;

  useEffect(() => {
    if (finale) {
      play('fanfare');
      const end = Date.now() + 3000;
      let shot = 0;
      const burst = () => {
        void confetti({ particleCount: 140, spread: 120, startVelocity: 50, origin: { x: ((shot++ * 0.41) % 1) * 0.8 + 0.1, y: 0.35 } });
        if (Date.now() < end) window.setTimeout(burst, 600);
      };
      burst();
      return;
    }
    if (!currentSeed) return;
    play('drumroll');
    const t = window.setTimeout(() => {
      setFlipped(currentSeed);
      play('reveal');
    }, suspenseMs);
    return () => window.clearTimeout(t);
  }, [currentSeed, finale, suspenseMs]);

  if (finale) {
    return (
      <m.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.soft} className="flex h-full flex-col gap-[1vw]">
        <h2 className="font-display text-center text-[3.5vw] font-extrabold text-gold">Your bracket is set!</h2>
        <div className="flex-1">
          <BracketBoard bracket={bracket} matches={matches} directory={directory} size="tv" />
        </div>
      </m.div>
    );
  }

  if (step === 0) {
    return (
      <div className="grid h-full place-items-center text-center">
        <m.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
          <p className="font-display text-[3vw] font-extrabold tracking-[0.3em] text-ink-muted">THE</p>
          <p className="font-display text-[9vw] font-extrabold leading-none">
            <span className="text-card-red">SELECTION</span> <span className="text-gold">SHOW</span>
          </p>
          <p className="mt-[2vw] text-[2.2vw] text-ink-muted">
            {n} players. {bracket.rounds.find((r) => r.number === 1)?.matchIds.length ?? 0} tables. One champion.
          </p>
        </m.div>
      </div>
    );
  }

  const round1 = (bracket.rounds.find((r) => r.number === 1)?.matchIds ?? []).map((id) => matches[id]).filter((x): x is MatchView => !!x);
  const shownUids = new Set(bracket.seeds.filter((s) => s.seed > n - revealed + (flipped === current?.seed ? 0 : 1)).map((s) => s.uid));
  const card = current ? directory[current.uid] : undefined;
  const isFlipped = !!current && flipped === current.seed;
  const top = !!current && current.seed <= 4;

  return (
    <div className="grid h-full grid-cols-[1.1fr_1fr] gap-[3vw]">
      {/* The reveal card */}
      <div className="relative grid place-items-center">
        {top && isFlipped && (
          <m.div aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(245,197,66,0.35),transparent_60%)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
        )}
        <AnimatePresence mode="wait">
          <m.div key={current?.seed ?? 'none'} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ x: '40vw', scale: 0.3, opacity: 0 }} transition={spring.soft} style={{ perspective: 1400 }}>
            <m.div
              className="relative h-[30vw] w-[22vw]"
              style={{ transformStyle: 'preserve-3d' }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="absolute inset-0 grid place-items-center rounded-[1.5vw] bg-gradient-to-br from-card-red to-felt-900 ring-4 ring-white/80 [backface-visibility:hidden]">
                <span className="font-display text-[12vw] font-extrabold text-white/90">?</span>
                <span className="absolute bottom-[1.5vw] font-display text-[2.4vw] font-extrabold">SEED #{current?.seed}</span>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1vw] rounded-[1.5vw] bg-felt-900 p-[1.5vw] text-center ring-4 ring-gold [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="font-display text-[2.4vw] font-extrabold text-gold">SEED #{current?.seed}</span>
                <Avatar avatarId={card?.avatarId ?? 'fox'} color={card?.avatarColor ?? 'teal'} size={200} label="" />
                <span className="font-display text-[3.4vw] font-extrabold leading-none">{isFlipped && <TypeOut text={card?.displayName ?? current?.displayName ?? ''} delay={0.3} />}</span>
                {card?.department && <span className="text-[1.6vw] text-ink-muted">{card.department}</span>}
                <span className="text-[1.6vw] font-semibold">{current?.score} qualifier pts</span>
              </div>
            </m.div>
          </m.div>
        </AnimatePresence>
      </div>

      {/* Tables filling up */}
      <div className="flex flex-col justify-center gap-[1.2vw]">
        {round1.map((mt) => (
          <div key={mt.id} className="rounded-[1vw] bg-felt-900/80 p-[1vw] ring-1 ring-white/10">
            <p className="font-display text-[1.8vw] font-extrabold">Table {mt.physicalTable}</p>
            <div className="mt-[0.5vw] grid grid-cols-2 gap-[0.6vw]">
              {mt.slots.map((uid, i) => {
                const shown = !!uid && shownUids.has(uid);
                const c = uid ? directory[uid] : undefined;
                return (
                  <div key={uid ?? i} className="flex h-[3vw] items-center gap-[0.6vw] rounded-lg bg-white/5 px-[0.6vw]">
                    <AnimatePresence>
                      {shown && (
                        <m.span className="flex items-center gap-[0.6vw]" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
                          <Avatar avatarId={c?.avatarId ?? 'fox'} color={c?.avatarColor ?? 'teal'} size={36} label="" />
                          <span className="truncate text-[1.4vw] font-semibold">{c?.displayName ?? 'Player'}</span>
                        </m.span>
                      )}
                    </AnimatePresence>
                    {!shown && <span className="text-[1.4vw] text-ink-muted">?</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
