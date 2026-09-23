import { ACTION_VALUES, COLORS, NUMBER_VALUES, type Card, type Color, type Value } from './types.js';

/** The standard 108-card deck, in a fixed (unshuffled) order. */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of COLORS) {
    for (const value of NUMBER_VALUES) {
      const copies = value === '0' ? 1 : 2;
      for (let n = 1; n <= copies; n++) cards.push({ id: `${color}-${value}-${n}`, color, value });
    }
    for (const value of ACTION_VALUES) {
      for (let n = 1; n <= 2; n++) cards.push({ id: `${color}-${value}-${n}`, color, value });
    }
  }
  for (let n = 1; n <= 4; n++) cards.push({ id: `wild-${n}`, color: 'wild', value: 'wild' });
  for (let n = 1; n <= 4; n++) cards.push({ id: `wild4-${n}`, color: 'wild', value: 'wild4' });
  return cards;
}

export function isWild(card: Card): boolean {
  return card.color === 'wild';
}

/** Official Uno point value, used for placement tiebreaks. */
export function cardPoints(card: Card): number {
  if (card.value === 'wild' || card.value === 'wild4') return 50;
  if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20;
  return Number(card.value);
}

export function handValue(hand: readonly Card[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

/** Does the card match the pile, ignoring Wild Draw 4 legality? */
export function matchesPile(card: Card, top: Card, currentColor: Color | null): boolean {
  if (isWild(card)) return true;
  return card.color === currentColor || card.value === top.value;
}

/** Wild Draw 4 may only be played when the hand holds no card of the current color. */
export function canPlayWild4(hand: readonly Card[], currentColor: Color | null): boolean {
  return !hand.some((c) => c.color === currentColor);
}

export function isPlayable(
  card: Card,
  hand: readonly Card[],
  top: Card,
  currentColor: Color | null,
): boolean {
  if (!matchesPile(card, top, currentColor)) return false;
  if (card.value === 'wild4') return canPlayWild4(hand, currentColor);
  return true;
}

export function isNumberValue(value: Value): boolean {
  return (NUMBER_VALUES as readonly string[]).includes(value);
}
