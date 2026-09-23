import {
  canPlayWild4,
  isPlayable,
  type Card,
  type Color,
  type EndedBy,
  type FinalLapState,
  type Phase,
} from '@nue-uno/engine';

export interface SeatView {
  uid: string;
  displayName: string;
  avatarId: string;
  avatarColor: string;
  department?: string | null;
  cardCount: number;
  away: boolean;
  forfeited: boolean;
  isBot?: boolean;
}

/** Everything the table UI needs — built from Firestore (online) or the local engine (practice). */
export interface TableViewModel {
  myUid: string;
  seats: SeatView[];
  myHand: Card[];
  topCard: Card | null;
  currentColor: Color | null;
  direction: 1 | -1;
  phase: Phase;
  turnUid: string | null;
  drawnCardId: string | null;
  drawPileCount: number;
  unoPending: string | null;
  finalLap: FinalLapState;
  /** Server deadline incl. grace; null = no timer (practice). */
  turnDeadlineMs: number | null;
  graceMs: number;
  paused: boolean;
  mode: 'casual' | 'ranked' | 'bracket' | 'practice';
  status: 'in_progress' | 'finished' | 'abandoned' | 'voided';
  placements: string[] | null;
  endedBy: EndedBy | null;
  version: number;
  /** Who played the current top card (for the throw direction, X3). */
  lastPlayedBy: string | null;
}

export interface TableActions {
  play(cardId: string, opts: { chosenColor?: Color; declareUno?: boolean }): Promise<void>;
  draw(): Promise<void>;
  pass(): Promise<void>;
  chooseColor(color: Color): Promise<void>;
  callUno(): Promise<void>;
  catchUno(targetUid: string): Promise<void>;
  leave(): Promise<void>;
}

export interface MyOptions {
  isMyTurn: boolean;
  playable: Set<string>;
  canDraw: boolean;
  canPass: boolean;
  mustChooseColor: boolean;
  canCallUno: boolean;
  catchable: string[];
  /** Playing now would leave exactly one card — offer the UNO! toggle (G4). */
  unoOnPlay: boolean;
}

/** What can I do right now? Mirrors engine.legalActions using only what this client can see. */
export function myOptions(view: TableViewModel): MyOptions {
  const me = view.seats.find((s) => s.uid === view.myUid);
  const active = view.status === 'in_progress' && !!me && !me.forfeited && !view.paused;
  const isMyTurn = active && view.turnUid === view.myUid;
  const hand = view.myHand;
  const playable = new Set<string>();
  if (isMyTurn && view.topCard) {
    if (view.phase === 'awaiting_play') {
      for (const c of hand) if (isPlayable(c, hand, view.topCard, view.currentColor)) playable.add(c.id);
    } else if (view.phase === 'awaiting_drawn_decision' && view.drawnCardId) {
      const drawn = hand.find((c) => c.id === view.drawnCardId);
      if (drawn && isPlayable(drawn, hand, view.topCard, view.currentColor)) playable.add(drawn.id);
    }
  }
  return {
    isMyTurn,
    playable,
    canDraw: isMyTurn && view.phase === 'awaiting_play',
    canPass: isMyTurn && view.phase === 'awaiting_drawn_decision',
    mustChooseColor: isMyTurn && view.phase === 'awaiting_color',
    canCallUno: active && view.unoPending === view.myUid,
    catchable: active && view.unoPending && view.unoPending !== view.myUid ? [view.unoPending] : [],
    unoOnPlay: isMyTurn && hand.length === 2 && playable.size > 0,
  };
}

/** Why is this card dimmed? Used for the friendly hint on tap (PRD O4). */
export function whyNotPlayable(view: TableViewModel, card: Card): string | null {
  if (view.turnUid !== view.myUid) return "Hang on — it's not your turn yet.";
  if (view.phase === 'awaiting_drawn_decision' && card.id !== view.drawnCardId) {
    return 'After drawing, you can only play the card you drew — or pass.';
  }
  if (card.value === 'wild4' && !canPlayWild4(view.myHand, view.currentColor)) {
    return `You can only play Wild Draw 4 when you have no ${view.currentColor} cards.`;
  }
  if (view.currentColor) {
    return `That card doesn't match. Play a ${view.currentColor} card, the same number or symbol, or a Wild.`;
  }
  return "That card doesn't match the pile.";
}

/** Sort a hand for display: by color, then value (data-model: hands are sorted for display). */
const COLOR_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
const VALUE_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];
export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      COLOR_ORDER[a.color]! - COLOR_ORDER[b.color]! ||
      VALUE_ORDER.indexOf(a.value) - VALUE_ORDER.indexOf(b.value) ||
      a.id.localeCompare(b.id),
  );
}

/** Seats in turn order starting with me — the table is drawn from my point of view. */
export function seatsFromMe(view: TableViewModel): SeatView[] {
  const i = view.seats.findIndex((s) => s.uid === view.myUid);
  if (i < 0) return view.seats;
  return [...view.seats.slice(i), ...view.seats.slice(0, i)];
}
