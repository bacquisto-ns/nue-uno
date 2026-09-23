import type { Card as CardModel } from '@nue-uno/engine';
import { Link } from 'react-router';
import { Card } from '../../ui/Card';
import { Panel } from '../../ui/primitives';

const c = (color: CardModel['color'], value: CardModel['value']): CardModel => ({ id: `${color}-${value}`, color, value });

/** PRD O1: rules at a glance, calling out the rules people most often get wrong. */
export function RulesPage() {
  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <Link to="/" className="text-ink-muted hover:text-ink">← Lobby</Link>
      <h1 className="font-display text-4xl font-extrabold">How to play</h1>

      <Panel className="space-y-3">
        <h2 className="font-display text-2xl font-extrabold">The goal</h2>
        <p>Be the first to play all your cards. On your turn, play a card that matches the top card's <strong>color</strong> or <strong>number/symbol</strong> — or play a <strong>Wild</strong>. Can't (or don't want to)? Draw one card. If it's playable you may play it right away; otherwise your turn ends.</p>
      </Panel>

      <Panel className="space-y-4">
        <h2 className="font-display text-2xl font-extrabold">Action cards</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            [c('red', 'skip'), 'Skip', 'The next player loses their turn.'],
            [c('blue', 'reverse'), 'Reverse', 'Play changes direction. With 2 players it works like a Skip.'],
            [c('green', 'draw2'), 'Draw Two', 'The next player draws 2 and loses their turn.'],
            [c('wild', 'wild'), 'Wild', 'Pick the next color.'],
            [c('wild', 'wild4'), 'Wild Draw Four', 'Pick a color; the next player draws 4 and loses their turn.'],
          ].map(([card, name, text]) => (
            <li key={name as string} className="flex items-center gap-3">
              <Card card={card as CardModel} width={48} />
              <div>
                <p className="font-semibold">{name as string}</p>
                <p className="text-sm text-ink-muted">{text as string}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="space-y-3 ring-gold/40">
        <h2 className="font-display text-2xl font-extrabold">⚠️ Rules people often get wrong</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>No stacking.</strong> You can't answer a +2 with a +2 (or a +4 with a +4). You draw and lose your turn.</li>
          <li><strong>You may draw even if you could play.</strong> Sometimes holding a card is smart.</li>
          <li><strong>Wild Draw Four only when you have no cards of the current color.</strong> The game enforces this — there's no challenging.</li>
          <li><strong>Call UNO!</strong> When you play your second-to-last card, tap <em>UNO!</em>. Forget, and anyone can tap <em>Catch!</em> before the next player moves — you draw 2.</li>
          <li><strong>Final Lap 🏁.</strong> Games are time-capped (20 min in qualifiers, 12 min in the bracket). When time's up, everyone gets one last turn, then fewest cards wins (ties: lowest card points).</li>
          <li><strong>Turn timer.</strong> 30 seconds (20 in the bracket). Run out and you automatically draw and pass. Three timeouts in a row marks you Away with 5-second turns until you act.</li>
        </ul>
      </Panel>

      <Panel className="space-y-2">
        <h2 className="font-display text-2xl font-extrabold">Ranked games</h2>
        <p>Ranked games need 3+ players and pay placement points: 10/6/3/1 at a 4-player table, 8/4/1 at 3. Your qualifier score is your best 10 results; you need 3 ranked games to be eligible for the bracket.</p>
      </Panel>

      <Panel>
        <h2 className="font-display text-2xl font-extrabold">Keyboard</h2>
        <p className="text-ink-muted">←/→ choose a card · Enter play · D draw · P pass · U UNO · 1–4 pick a color</p>
      </Panel>
    </main>
  );
}
