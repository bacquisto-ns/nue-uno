import { isNumberValue, isPlayable } from './deck.js';
import { getCurrentUid, getTopCard, mostHeldColor } from './engine.js';
import type { Action, Card, GameState } from './types.js';

export type BotLevel = 'tutorial' | 'normal';

const ACTION_PRIORITY: Record<string, number> = { draw2: 0, wild4: 1, skip: 2, reverse: 3 };

function nextPlayerCardCount(state: GameState): number {
  const n = state.players.length;
  let idx = state.turn;
  for (let i = 0; i < n; i++) {
    idx = (((idx + state.direction) % n) + n) % n;
    const uid = state.players[idx]!;
    if (!state.forfeited.includes(uid)) return state.hands[uid]!.length;
  }
  return Infinity;
}

/** Order candidate cards by the bot's preference (best first). */
function rankCandidates(state: GameState, playable: Card[]): Card[] {
  const threatened = nextPlayerCardCount(state) <= 2;
  const score = (c: Card): number => {
    if (threatened && c.value in ACTION_PRIORITY) return ACTION_PRIORITY[c.value]!;
    if (c.color === state.currentColor && isNumberValue(c.value)) return 10 - Number(c.value) / 10;
    if (isNumberValue(c.value)) return 20 - Number(c.value) / 10;
    if (c.value === 'skip' || c.value === 'reverse' || c.value === 'draw2') return 30;
    if (c.value === 'wild') return 40;
    return 50; // wild4 last
  };
  return [...playable].sort((a, b) => score(a) - score(b));
}

/**
 * Choose an action for a bot, using only public information plus its own hand.
 * Returns null when there is nothing for this bot to do right now.
 * Bots are for practice and the tutorial only — never ranked or bracket games.
 */
export function botAction(
  state: GameState,
  uid: string,
  random: () => number,
  level: BotLevel = 'normal',
): Action | null {
  if (state.phase === 'finished' || state.forfeited.includes(uid)) return null;

  if (level === 'normal' && state.unoPending && state.unoPending !== uid) {
    return { type: 'catchUno', uid, targetUid: state.unoPending };
  }
  if (getCurrentUid(state) !== uid) return null;

  const hand = state.hands[uid]!;
  const top = getTopCard(state);
  const declare = (card: Card) =>
    hand.length === 2 && hand.some((c) => c.id === card.id)
      ? level === 'tutorial' || random() < 0.85
      : false;

  const play = (card: Card): Action => {
    const action: Extract<Action, { type: 'play' }> = {
      type: 'play',
      uid,
      cardId: card.id,
      declareUno: declare(card),
    };
    if (card.color === 'wild') {
      const rest = hand.filter((c) => c.id !== card.id);
      action.chosenColor = mostHeldColor(rest.length ? rest : hand);
    }
    return action;
  };

  switch (state.phase) {
    case 'awaiting_color':
      return { type: 'chooseColor', uid, color: mostHeldColor(hand) };

    case 'awaiting_drawn_decision': {
      const drawn = hand.find((c) => c.id === state.drawnCardId);
      if (drawn && isPlayable(drawn, hand, top, state.currentColor) && random() < 0.9) {
        return play(drawn);
      }
      return { type: 'pass', uid };
    }

    case 'awaiting_play': {
      const playable = hand.filter((c) => isPlayable(c, hand, top, state.currentColor));
      const best = rankCandidates(state, playable)[0];
      return best ? play(best) : { type: 'draw', uid };
    }
  }
}
