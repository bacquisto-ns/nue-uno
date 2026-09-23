export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export const NUMBER_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export const ACTION_VALUES = ['skip', 'reverse', 'draw2'] as const;
export const WILD_VALUES = ['wild', 'wild4'] as const;
export type Value =
  | (typeof NUMBER_VALUES)[number]
  | (typeof ACTION_VALUES)[number]
  | (typeof WILD_VALUES)[number];

export interface Card {
  /** Stable and unique within a deck, e.g. "red-7-1", "wild4-3". */
  id: string;
  color: Color | 'wild';
  value: Value;
}

export type Phase = 'awaiting_play' | 'awaiting_color' | 'awaiting_drawn_decision' | 'finished';
export type EndedBy = 'empty_hand' | 'final_lap' | 'last_player_standing';

export interface RulesConfig {
  handSize: number;
  awayAfterTimeouts: number;
  /** Reserved for house rules; the engine only supports `false` today. */
  stacking: false;
  sevenZero: false;
  jumpIn: false;
}

export const DEFAULT_RULES: RulesConfig = {
  handSize: 7,
  awayAfterTimeouts: 3,
  stacking: false,
  sevenZero: false,
  jumpIn: false,
};

export interface PlayerGameStats {
  cardsPlayed: number;
  cardsPlayedByValue: Partial<Record<Value, number>>;
  wild4Played: number;
  draw2Played: number;
  cardsDrawn: number;
  unoCalls: number;
  catches: number;
  timesCaught: number;
  timeouts: number;
  maxHandSize: number;
  wild4Victims: Record<string, number>;
}

export interface FinalLapState {
  active: boolean;
  /** Players (in turn order) who still get their last turn. */
  remaining: string[];
}

export interface GameState {
  rules: RulesConfig;
  /** Seat order; turn order when direction = 1. */
  players: string[];
  hands: Record<string, Card[]>;
  /** Last element is the top of the draw pile. */
  drawPile: Card[];
  /** Last element is the visible top card. */
  discardPile: Card[];
  currentColor: Color | null;
  direction: 1 | -1;
  /** Index into `players` of the player whose turn it is. */
  turn: number;
  phase: Phase;
  drawnCardId: string | null;
  unoPending: string | null;
  consecutiveTimeouts: Record<string, number>;
  away: Record<string, boolean>;
  forfeited: string[];
  turnCount: number;
  finalLap: FinalLapState;
  stats: Record<string, PlayerGameStats>;
  rngState: number;
  placements: string[] | null;
  endedBy: EndedBy | null;
  version: number;
}

export type Action =
  | { type: 'play'; uid: string; cardId: string; chosenColor?: Color; declareUno?: boolean }
  | { type: 'draw'; uid: string }
  | { type: 'pass'; uid: string }
  | { type: 'chooseColor'; uid: string; color: Color }
  | { type: 'callUno'; uid: string }
  | { type: 'catchUno'; uid: string; targetUid: string }
  | { type: 'timeout' }
  | { type: 'startFinalLap' }
  | { type: 'forfeit'; uid: string };

export type EngineError =
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'CARD_NOT_IN_HAND'
  | 'ILLEGAL_CARD'
  | 'ILLEGAL_WILD_DRAW_FOUR'
  | 'COLOR_REQUIRED'
  | 'MUST_PLAY_DRAWN_CARD_OR_PASS'
  | 'NO_UNO_PENDING'
  | 'CANNOT_CATCH_SELF'
  | 'NOT_A_PLAYER'
  | 'GAME_FINISHED';

export type EngineEventType =
  | 'game_started'
  | 'card_played'
  | 'cards_drawn'
  | 'turn_passed'
  | 'color_chosen'
  | 'uno_called'
  | 'uno_caught'
  | 'timeout'
  | 'player_forfeited'
  | 'deck_reshuffled'
  | 'final_lap'
  | 'game_finished';

export interface EngineEvent {
  type: EngineEventType;
  uid?: string;
  card?: Card;
  count?: number;
  targetUid?: string;
  color?: Color;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: EngineEvent[]; turnChanged: boolean }
  | { ok: false; error: EngineError; message: string };

export interface LegalActions {
  playableCardIds: string[];
  canDraw: boolean;
  canPass: boolean;
  mustChooseColor: boolean;
  canCallUno: boolean;
  catchableUids: string[];
}

export interface Ranking {
  uid: string;
  place: number;
  cardsLeft: number;
  handValue: number;
  forfeited: boolean;
}
