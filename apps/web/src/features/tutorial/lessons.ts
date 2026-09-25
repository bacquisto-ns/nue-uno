import { createDeck, createRandom, type Card } from '@nue-uno/engine';
import { myOptions, type TableViewModel } from '../../game/view';

/**
 * The interactive tutorial (PRD O2): a short real game against one friendly bot with a stacked
 * deck, plus a coach who explains whatever the player is looking at. Lessons are ticked off as the
 * player does them, so it adapts to however the game actually goes.
 */
export const LESSONS = ['match', 'action', 'wild', 'draw', 'uno'] as const;
export type Lesson = (typeof LESSONS)[number];

export const LESSON_LABEL: Record<Lesson, string> = {
  match: 'Match color or number',
  action: 'Play an action card',
  wild: 'Play a Wild',
  draw: 'Draw when stuck',
  uno: 'Call UNO!',
};

export const TUTORIAL_ME = 'me';
export const TUTORIAL_BOT = 'bot-coach';
export const TUTORIAL_HAND_SIZE = 5;

const pick = (deck: Card[], id: string): Card => {
  const i = deck.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`No card ${id}`);
  return deck.splice(i, 1)[0]!;
};

/**
 * Stacked deck for [me, coach] with 5 cards each (dealt alternately), then the starting card, then
 * the rest in a fixed shuffle. My hand covers every lesson: a number that matches, a Skip, a Wild,
 * and off-color cards so I'll need to draw at some point.
 */
export function tutorialDeck(): Card[] {
  const rest = createDeck();
  const mine = ['red-7-1', 'red-skip-1', 'wild-1', 'green-4-1', 'yellow-9-1'].map((id) => pick(rest, id));
  const coach = ['blue-2-1', 'green-7-1', 'yellow-2-1', 'blue-9-1', 'green-1-1'].map((id) => pick(rest, id));
  const start = pick(rest, 'red-3-1');
  // No Wild Draw 4s in the tutorial: keep the first game gentle.
  const pool = rest.filter((c) => c.value !== 'wild4');
  const random = createRandom(0x7070);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const dealt = mine.flatMap((c, i) => [c, coach[i]!]);
  return [...dealt, start, ...pool];
}

export interface LessonEvent {
  type: string;
  uid?: string;
  card?: { value: string; color: string };
}

/** Which lesson (if any) this event completes. */
export function lessonDone(e: LessonEvent): Lesson | null {
  if (e.uid !== TUTORIAL_ME) return null;
  if (e.type === 'uno_called') return 'uno';
  if (e.type === 'cards_drawn') return 'draw';
  if (e.type === 'card_played' && e.card) {
    if (e.card.value === 'wild' || e.card.value === 'wild4') return 'wild';
    if (e.card.value === 'skip' || e.card.value === 'reverse' || e.card.value === 'draw2') return 'action';
    return 'match';
  }
  return null;
}

export interface CoachTip {
  text: string;
  /** The lesson this tip is teaching, highlighted in the checklist. */
  lesson: Lesson | null;
}

/** What the coach says right now, given the table and the lessons already done. */
export function coachTip(view: TableViewModel, done: ReadonlySet<Lesson>): CoachTip {
  if (view.status === 'finished') {
    return { text: view.placements?.[0] === TUTORIAL_ME ? 'You won! You know everything you need. 🎉' : "Coach got there first — but you've got the hang of it! 🎉", lesson: null };
  }
  const o = myOptions(view);
  if (!o.isMyTurn) {
    if (o.catchable.length) return { text: 'Coach forgot to call UNO! Tap "Catch!" to make them draw 2.', lesson: null };
    return { text: "Coach is thinking… Watch the pile: you'll need to match its color or number.", lesson: null };
  }
  if (o.mustChooseColor) return { text: 'Pick a color! Choose the one you hold the most of.', lesson: 'wild' };
  const hand = view.myHand.filter((c) => o.playable.has(c.id));
  if (o.unoOnPlay && !done.has('uno')) return { text: 'Two cards left! Tap UNO! before you play, or you can be caught and draw 2.', lesson: 'uno' };
  if (o.canPass) return { text: "You drew a card. If it matches you can play it; otherwise tap Pass.", lesson: 'draw' };
  if (hand.length === 0) return { text: "Nothing matches, so tap the deck to draw a card.", lesson: 'draw' };
  const action = hand.find((c) => c.value === 'skip' || c.value === 'reverse' || c.value === 'draw2');
  if (action && !done.has('action')) {
    return { text: 'Action cards! Skip makes the next player miss a turn (with two players, you go again). Reverse flips direction; +2 makes them draw 2.', lesson: 'action' };
  }
  const wild = hand.find((c) => c.value === 'wild' || c.value === 'wild4');
  if (wild && !done.has('wild') && done.has('match')) return { text: 'A Wild goes on anything, and then you choose the next color.', lesson: 'wild' };
  return { text: 'Your turn! Play a glowing card: it matches the pile by color or number.', lesson: done.has('match') ? null : 'match' };
}
