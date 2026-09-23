import {
  COLORS,
  createDeck,
  createRandom,
  isPlayable,
  Rng,
  type Card as CardModel,
  type Color,
} from '@nue-uno/engine';
import { AnimatePresence, LayoutGroup, m as motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useEffectsMode, useEffectsStore, type EffectsMode } from '../../motion/effectsMode';
import { dur, ease, spring, stagger } from '../../motion/tokens';
import { Card, CARD_COLORS, ColorShape } from '../../ui/Card';
import { Button } from '../../ui/primitives';
import { EffectsLayer, type FxEvent } from '../game/EffectsLayer';

const TARGET = 'gallery-target';
const DEMOS: { label: string; event: Omit<FxEvent, 'seq'> }[] = [
  { label: 'Wild (X5)', event: { type: 'card_played', card: { id: 'w', color: 'wild', value: 'wild' }, color: 'blue' } },
  { label: 'Skip (X6)', event: { type: 'card_played', card: { id: 's', color: 'red', value: 'skip' }, targetUid: TARGET } },
  { label: 'Reverse (X6)', event: { type: 'card_played', card: { id: 'r', color: 'red', value: 'reverse' } } },
  { label: '+2 (X6)', event: { type: 'card_played', card: { id: 'd', color: 'green', value: 'draw2' }, targetUid: TARGET } },
  { label: '+4 IMPACT (X7)', event: { type: 'card_played', card: { id: 'w4', color: 'wild', value: 'wild4' }, color: 'red', targetUid: TARGET } },
  { label: 'UNO! (X8)', event: { type: 'uno_called', uid: TARGET } },
  { label: 'CAUGHT! (X9)', event: { type: 'uno_caught', uid: 'nobody', targetUid: TARGET } },
  { label: 'Final Lap (X11)', event: { type: 'final_lap' } },
  { label: 'Victory (X12)', event: { type: 'game_finished' } },
];

const CARD_W = 84;
/** Fresh shuffle each visit; seeded once per page load (outside render, so renders stay pure). */
const SEED = Date.now() | 0;

interface PileCard {
  card: CardModel;
  rotate: number;
  x: number;
  y: number;
}

/** Hand fan geometry (X2): arc spread and overlap shrink as the hand grows. */
function fanPosition(i: number, n: number) {
  const mid = (n - 1) / 2;
  const offset = i - mid;
  const spread = Math.min(7, 42 / Math.max(n, 1));
  const gap = Math.min(CARD_W * 0.62, 420 / Math.max(n, 1));
  return { x: offset * gap, y: Math.abs(offset) ** 1.6 * 2.2, rotate: offset * spread };
}

/**
 * /dev/effects — the effects gallery (motion spec §11). Every signature moment is reviewed here in
 * Full / Reduced / Off before it ships. Week 1 covers X1 deal, X2 hand fan, X3 throw, X4 draw.
 */
export function EffectsGallery() {
  const mode = useEffectsMode();
  const setPreference = useEffectsStore((s) => s.setPreference);
  const rng = useMemo(() => new Rng(SEED), []);
  const random = useMemo(() => createRandom(SEED ^ 0x9e3779b9), []);

  const [deck, setDeck] = useState<CardModel[]>(() => rng.shuffle(createDeck()));
  const [hand, setHand] = useState<CardModel[]>([]);
  const [pile, setPile] = useState<PileCard[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [color, setColor] = useState<Color>('red');
  const [dealKey, setDealKey] = useState(0);
  const [fx, setFx] = useState<FxEvent[]>([]);
  const [shakes, setShakes] = useState(0);
  const fire = (e: Omit<FxEvent, 'seq'>) => setFx((prev) => [...prev.slice(-8), { ...e, seq: (prev.at(-1)?.seq ?? 0) + 1 }]);

  const top = pile.at(-1)?.card;
  const animated = mode === 'full';
  const t = (full: object) => (mode === 'full' ? full : mode === 'reduced' ? { duration: 0.15 } : { duration: 0 });

  function deal() {
    const fresh = rng.shuffle(createDeck());
    const first = fresh.findIndex((c) => c.color !== 'wild');
    const [start] = fresh.splice(first, 1);
    setHand(fresh.splice(0, 7));
    setPile([{ card: start!, rotate: 0, x: 0, y: 0 }]);
    setColor(start!.color as Color);
    setDeck(fresh);
    setSelected(null);
    setDealKey((k) => k + 1);
  }

  function draw() {
    if (!deck.length) return;
    const [card, ...rest] = deck;
    setDeck(rest);
    setHand((h) => [...h, card!]);
  }

  function tapCard(card: CardModel) {
    if (selected !== card.id) {
      setSelected(card.id);
      return;
    }
    // Second tap throws it (X3). Wilds pick a random color for the demo.
    const nextColor = card.color === 'wild' ? COLORS[Math.floor(random() * 4)]! : (card.color as Color);
    setHand((h) => h.filter((c) => c.id !== card.id));
    setPile((p) => [
      ...p.slice(-6),
      { card, rotate: (random() - 0.5) * 30, x: (random() - 0.5) * 14, y: (random() - 0.5) * 10 },
    ]);
    setColor(nextColor);
    setSelected(null);
  }

  const tint = `color-mix(in srgb, ${CARD_COLORS[color].fill} 22%, transparent)`;

  return (
    <main className="felt-grain relative flex min-h-dvh flex-col overflow-hidden">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ background: `radial-gradient(ellipse at 50% 40%, ${tint}, transparent 65%)` }}
        transition={t({ duration: dur.emphasis })}
      />

      <header className="relative z-10 flex flex-wrap items-center gap-3 p-4">
        <Link to="/" className="text-ink-muted hover:text-ink">← Home</Link>
        <h1 className="font-display text-2xl font-extrabold">Effects gallery</h1>
        <div className="ml-auto flex gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10" role="radiogroup" aria-label="Effects mode">
          {(['full', 'reduced', 'off'] as EffectsMode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => setPreference(m)}
              className={`rounded-lg px-3 py-1.5 text-sm capitalize ${mode === m ? 'bg-gold text-felt-950' : ''}`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      <LayoutGroup>
        <section className="relative z-10 flex flex-1 items-center justify-center gap-10">
          {/* Deck */}
          <button onClick={draw} aria-label="Draw a card (X4)" className="relative" disabled={!deck.length}>
            {[2, 1, 0].map((i) => (
              <div key={i} className="absolute" style={{ top: -i * 2, left: -i * 2 }}>
                <Card faceDown width={CARD_W} />
              </div>
            ))}
            <Card faceDown width={CARD_W} className="relative opacity-0" />
          </button>

          {/* Discard pile */}
          <div className="relative" style={{ width: CARD_W, height: CARD_W * 1.5 }} aria-label="Discard pile">
            <AnimatePresence>
              {pile.map((p) => (
                <motion.div
                  key={p.card.id}
                  layoutId={animated ? p.card.id : undefined}
                  className="absolute inset-0 drop-shadow-xl"
                  initial={animated ? false : { opacity: 0 }}
                  animate={{ rotate: p.rotate, x: p.x, y: p.y, opacity: 1, scale: 1 }}
                  transition={t({ duration: dur.standard, ease: ease.throw })}
                >
                  <Card card={p.card} width={CARD_W} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div data-seat={TARGET} className="flex flex-col items-center gap-1 text-sm" aria-live="polite">
            <span className="grid h-12 w-12 place-items-center rounded-full ring-2 ring-white/40" style={{ background: CARD_COLORS[color].fill, color: CARD_COLORS[color].ink }}>
              <ColorShape color={color} size={18} />
            </span>
            <span className="font-semibold">{CARD_COLORS[color].label}</span>
          </div>
        </section>

        {/* Hand fan */}
        <section className="relative z-10 flex h-64 items-end justify-center pb-10" aria-label="Your hand">
          <div key={dealKey} className="relative h-40" style={{ width: CARD_W }}>
            <AnimatePresence>
              {hand.map((card, i) => {
                const pos = fanPosition(i, hand.length);
                const playable = !!top && isPlayable(card, hand, top, color);
                const isSel = selected === card.id;
                return (
                  <motion.button
                    key={card.id}
                    layoutId={animated ? card.id : undefined}
                    onClick={() => tapCard(card)}
                    aria-pressed={isSel}
                    className="absolute bottom-0 left-0 origin-bottom"
                    style={{ zIndex: isSel ? 100 : i }}
                    initial={
                      animated
                        ? { x: -260, y: -300, rotate: -30, rotateY: 180, opacity: 0 }
                        : { opacity: 0 }
                    }
                    animate={{
                      x: pos.x,
                      y: pos.y - (isSel ? 28 : playable ? 12 : 0),
                      rotate: pos.rotate,
                      rotateY: 0,
                      scale: isSel ? 1.06 : 1,
                      opacity: 1,
                    }}
                    whileHover={animated ? { y: pos.y - (isSel ? 32 : 20) } : undefined}
                    transition={t({ ...spring.snappy, delay: dealKey && i < 7 ? i * stagger.deal : 0 })}
                  >
                    <div
                      className="rounded-[10px] transition-shadow"
                      style={{
                        boxShadow: playable ? `0 0 18px 2px ${CARD_COLORS[color].fill}` : '0 8px 16px #0006',
                      }}
                    >
                      <Card card={card} width={CARD_W} dimmed={!!top && !playable} />
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
      </LayoutGroup>

      <footer className="relative z-10 flex flex-wrap justify-center gap-3 p-4">
        <Button onClick={deal}>Deal (X1)</Button>
        <Button variant="ghost" onClick={draw} disabled={!pile.length}>Draw (X4)</Button>
        <div className="flex w-full flex-wrap justify-center gap-2">
          {DEMOS.map((d) => (
            <Button key={d.label} variant="ghost" className="text-sm" onClick={() => fire(d.event)}>{d.label}</Button>
          ))}
        </div>
        <p className="w-full text-center text-xs text-ink-muted">
          Tap a card to select (X2) · tap again to throw it (X3) · mode: <strong>{mode}</strong>
        </p>
      </footer>
      <EffectsLayer events={fx} mode={mode} onShake={() => setShakes((s) => s + 1)} />
      <span className="sr-only" aria-live="polite">{shakes ? `Shake ${shakes}` : ''}</span>
    </main>
  );
}
