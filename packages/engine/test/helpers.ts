import { applyAction, createGame, type Action, type Card, type Color, type GameState } from '../src/index.js';

const COLOR_CODES: Record<string, Color> = { r: 'red', y: 'yellow', g: 'green', b: 'blue' };
const VALUE_CODES: Record<string, Card['value']> = { S: 'skip', R: 'reverse', D: 'draw2' };

let serial = 0;

/**
 * Build a card from a short code: "r5" red 5, "gS" green skip, "bR" blue reverse, "yD" yellow
 * draw two, "W" wild, "W4" wild draw four. Ids are unique across the test run.
 */
export function c(code: string): Card {
  serial++;
  if (code === 'W') return { id: `t-wild-${serial}`, color: 'wild', value: 'wild' };
  if (code === 'W4') return { id: `t-wild4-${serial}`, color: 'wild', value: 'wild4' };
  const color = COLOR_CODES[code[0]!];
  const rest = code.slice(1);
  const value = VALUE_CODES[rest] ?? (rest as Card['value']);
  if (!color) throw new Error(`bad card code ${code}`);
  return { id: `t-${color}-${value}-${serial}`, color, value };
}

export const PLAYERS = ['p0', 'p1', 'p2', 'p3'];

export interface Setup {
  /** One array of card codes per player; all the same length (becomes the hand size). */
  hands: string[][];
  /** The card flipped to start the discard pile. */
  flip: string;
  /** Remaining draw pile in draw order (first element is drawn first). */
  draw?: string[];
  /** Defaults to the last seat, so seat 0 plays first. */
  dealerIndex?: number;
}

/** Create a game with a fully stacked deck. Returns state plus the parsed hands for lookups. */
export function setup(opts: Setup): { state: GameState; hands: Card[][]; draw: Card[] } {
  const n = opts.hands.length;
  const handSize = opts.hands[0]!.length;
  const hands = opts.hands.map((h) => h.map(c));
  const flip = c(opts.flip);
  const draw = (opts.draw ?? []).map(c);
  const preset: Card[] = [];
  for (let round = 0; round < handSize; round++) {
    for (let p = 0; p < n; p++) preset.push(hands[p]![round]!);
  }
  preset.push(flip, ...draw);
  const { state } = createGame(PLAYERS.slice(0, n), 42, {
    presetDeck: preset,
    dealerIndex: opts.dealerIndex ?? n - 1,
    rules: { handSize },
  });
  return { state, hands, draw };
}

/** Apply an action and assert it succeeded. */
export function act(state: GameState, action: Action): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`expected ok, got ${res.error}: ${res.message}`);
  return res.state;
}

export function applyOk(state: GameState, action: Action) {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`expected ok, got ${res.error}: ${res.message}`);
  return res;
}

export function totalCards(state: GameState): number {
  return (
    state.drawPile.length +
    state.discardPile.length +
    Object.values(state.hands).reduce((sum, h) => sum + h.length, 0)
  );
}

export function allCardIds(state: GameState): string[] {
  return [
    ...state.drawPile,
    ...state.discardPile,
    ...Object.values(state.hands).flat(),
  ].map((card) => card.id);
}

export const turnOf = (s: GameState) => s.players[s.turn];
