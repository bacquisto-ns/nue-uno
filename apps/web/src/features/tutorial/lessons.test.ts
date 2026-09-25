import { applyAction, createGame, type GameState } from '@nue-uno/engine';
import { describe, expect, it } from 'vitest';
import { localView } from '../../game/local';
import { coachTip, lessonDone, TUTORIAL_BOT, TUTORIAL_HAND_SIZE, TUTORIAL_ME, tutorialDeck } from './lessons';

const seats = [
  { uid: TUTORIAL_ME, displayName: 'Me', avatarId: 'fox', avatarColor: 'teal' },
  { uid: TUTORIAL_BOT, displayName: 'Coach', avatarId: 'owl', avatarColor: 'amber' },
];
const start = () => createGame([TUTORIAL_ME, TUTORIAL_BOT], 1, { presetDeck: tutorialDeck(), dealerIndex: 1, rules: { handSize: TUTORIAL_HAND_SIZE } }).state;
const view = (s: GameState) => localView(s, TUTORIAL_ME, seats, null);

describe('tutorial deck', () => {
  it('is a full 108-card deck minus the Wild Draw 4s, with a hand that covers every lesson', () => {
    const deck = tutorialDeck();
    expect(deck).toHaveLength(104);
    expect(new Set(deck.map((c) => c.id)).size).toBe(104);
    expect(deck.some((c) => c.value === 'wild4')).toBe(false);
    const s = start();
    expect(s.hands[TUTORIAL_ME]!.map((c) => c.id).sort()).toEqual(['green-4-1', 'red-7-1', 'red-skip-1', 'wild-1', 'yellow-9-1']);
    expect(s.discardPile.at(-1)!.id).toBe('red-3-1');
    expect(s.players[s.turn]).toBe(TUTORIAL_ME); // Coach deals, so I go first
  });
});

describe('coach', () => {
  it('teaches the action card first when one is playable, then matching', () => {
    const s = start();
    expect(coachTip(view(s), new Set()).lesson).toBe('action');
    expect(coachTip(view(s), new Set(['action'])).lesson).toBe('match');
  });

  it('tells me to draw when nothing matches, and to pick a color after a Wild', () => {
    const s = start();
    expect(coachTip(view({ ...s, phase: 'awaiting_color' }), new Set()).lesson).toBe('wild');
    // Playing the Wild (with its color) ticks the lesson off.
    const res = applyAction(s, { type: 'play', uid: TUTORIAL_ME, cardId: 'wild-1', chosenColor: 'green' });
    if (!res.ok) throw new Error(res.message);
    expect(res.events.map(lessonDone)).toContain('wild');
    const stuck = { ...s, hands: { ...s.hands, [TUTORIAL_ME]: s.hands[TUTORIAL_ME]!.filter((c) => c.color !== 'red' && c.color !== 'wild' && c.value !== '3') } };
    expect(coachTip(view(stuck), new Set()).lesson).toBe('draw');
  });

  it('marks lessons from my own events only', () => {
    expect(lessonDone({ type: 'card_played', uid: TUTORIAL_ME, card: { value: 'skip', color: 'red' } })).toBe('action');
    expect(lessonDone({ type: 'card_played', uid: TUTORIAL_ME, card: { value: 'wild', color: 'wild' } })).toBe('wild');
    expect(lessonDone({ type: 'card_played', uid: TUTORIAL_ME, card: { value: '7', color: 'red' } })).toBe('match');
    expect(lessonDone({ type: 'cards_drawn', uid: TUTORIAL_ME })).toBe('draw');
    expect(lessonDone({ type: 'uno_called', uid: TUTORIAL_ME })).toBe('uno');
    expect(lessonDone({ type: 'uno_called', uid: TUTORIAL_BOT })).toBeNull();
  });
});
