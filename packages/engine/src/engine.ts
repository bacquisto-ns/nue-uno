import { createDeck, handValue, isPlayable, isWild } from './deck.js';
import { messageFor } from './messages.js';
import { Rng } from './rng.js';
import {
  COLORS,
  DEFAULT_RULES,
  type Action,
  type ApplyResult,
  type Card,
  type Color,
  type EndedBy,
  type EngineError,
  type EngineEvent,
  type GameState,
  type LegalActions,
  type PlayerGameStats,
  type Ranking,
  type RulesConfig,
} from './types.js';

export interface CreateGameOptions {
  rules?: Partial<RulesConfig>;
  /** Cards in draw order (index 0 is dealt first). Used by tests and the tutorial. */
  presetDeck?: Card[];
  /** Force the dealer seat instead of choosing it randomly. */
  dealerIndex?: number;
}

// ---------------------------------------------------------------------------------------------
// Small helpers (all operate on a working copy of the state)
// ---------------------------------------------------------------------------------------------

function emptyStats(): PlayerGameStats {
  return {
    cardsPlayed: 0,
    cardsPlayedByValue: {},
    wild4Played: 0,
    draw2Played: 0,
    cardsDrawn: 0,
    unoCalls: 0,
    catches: 0,
    timesCaught: 0,
    timeouts: 0,
    maxHandSize: 0,
    wild4Victims: {},
  };
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function isActive(s: GameState, uid: string): boolean {
  return s.players.includes(uid) && !s.forfeited.includes(uid);
}

function activePlayers(s: GameState): string[] {
  return s.players.filter((p) => !s.forfeited.includes(p));
}

function currentUid(s: GameState): string {
  return s.players[s.turn]!;
}

function topCard(s: GameState): Card {
  return s.discardPile[s.discardPile.length - 1]!;
}

/** Index of the next active seat, `steps` active seats away in the current direction. */
function nextIndex(s: GameState, from: number, steps = 1): number {
  const n = s.players.length;
  let idx = from;
  let moved = 0;
  // Guard against infinite loops if everyone has forfeited (the game ends before that happens).
  for (let guard = 0; moved < steps && guard < n * (steps + 1); guard++) {
    idx = (((idx + s.direction) % n) + n) % n;
    if (!s.forfeited.includes(s.players[idx]!)) moved++;
  }
  return idx;
}

function trackHandSize(s: GameState, uid: string): void {
  const stats = s.stats[uid]!;
  stats.maxHandSize = Math.max(stats.maxHandSize, s.hands[uid]!.length);
}

function reshuffleDiscard(s: GameState, rng: Rng, events: EngineEvent[]): boolean {
  if (s.discardPile.length <= 1) return false;
  const top = s.discardPile.pop()!;
  s.drawPile = rng.shuffle(s.discardPile);
  s.discardPile = [top];
  events.push({ type: 'deck_reshuffled', count: s.drawPile.length });
  return true;
}

/** Draw up to `count` cards for `uid`. Returns the cards actually drawn. */
function drawCards(
  s: GameState,
  rng: Rng,
  events: EngineEvent[],
  uid: string,
  count: number,
): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0 && !reshuffleDiscard(s, rng, events)) break;
    const card = s.drawPile.pop()!;
    s.hands[uid]!.push(card);
    drawn.push(card);
  }
  if (drawn.length > 0) {
    events.push({ type: 'cards_drawn', uid, count: drawn.length });
    s.stats[uid]!.cardsDrawn += drawn.length;
    trackHandSize(s, uid);
  }
  return drawn;
}

function resetInactivity(s: GameState, uid: string): void {
  s.consecutiveTimeouts[uid] = 0;
  s.away[uid] = false;
}

function finish(s: GameState, events: EngineEvent[], endedBy: EndedBy): void {
  s.phase = 'finished';
  s.endedBy = endedBy;
  s.unoPending = null;
  s.drawnCardId = null;
  s.placements = rankPlayers(s).map((r) => r.uid);
  events.push({ type: 'game_finished', uid: s.placements[0] });
}

/**
 * Move the turn on from the current player. `lostTurns` is how many following players lose their
 * turn (Skip, Draw Two, Wild Draw Four). Handles turn counting and the Final Lap.
 */
function endTurn(s: GameState, events: EngineEvent[], lostTurns = 0): void {
  const ending = currentUid(s);
  const victims: string[] = [];
  let idx = s.turn;
  for (let i = 0; i < lostTurns; i++) {
    idx = nextIndex(s, idx);
    victims.push(s.players[idx]!);
  }
  s.turn = nextIndex(s, idx);
  s.turnCount += 1 + victims.length;
  s.phase = 'awaiting_play';
  s.drawnCardId = null;

  if (s.finalLap.active) {
    const done = new Set([ending, ...victims]);
    s.finalLap.remaining = s.finalLap.remaining.filter((uid) => !done.has(uid));
    if (s.finalLap.remaining.length === 0) finish(s, events, 'final_lap');
  }
}

function mostHeldColor(hand: readonly Card[]): Color {
  let best: Color = COLORS[0];
  let bestCount = -1;
  for (const color of COLORS) {
    const count = hand.filter((c) => c.color === color).length;
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

function fail(error: EngineError, s?: GameState): ApplyResult {
  return { ok: false, error, message: messageFor(error, s) };
}

// ---------------------------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------------------------

export function createGame(
  players: string[],
  seed: number,
  opts: CreateGameOptions = {},
): { state: GameState; events: EngineEvent[] } {
  if (players.length < 2 || players.length > 10) throw new Error('Uno needs 2–10 players');
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');

  const rules: RulesConfig = { ...DEFAULT_RULES, ...opts.rules };
  const rng = new Rng(seed | 0);
  const events: EngineEvent[] = [];

  const drawPile = opts.presetDeck
    ? [...opts.presetDeck].reverse()
    : rng.shuffle(createDeck());

  const s: GameState = {
    rules,
    players: [...players],
    hands: Object.fromEntries(players.map((p) => [p, [] as Card[]])),
    drawPile,
    discardPile: [],
    currentColor: null,
    direction: 1,
    turn: 0,
    phase: 'awaiting_play',
    drawnCardId: null,
    unoPending: null,
    consecutiveTimeouts: Object.fromEntries(players.map((p) => [p, 0])),
    away: Object.fromEntries(players.map((p) => [p, false])),
    forfeited: [],
    turnCount: 0,
    finalLap: { active: false, remaining: [] },
    stats: Object.fromEntries(players.map((p) => [p, emptyStats()])),
    rngState: 0,
    placements: null,
    endedBy: null,
    version: 1,
  };

  for (let round = 0; round < rules.handSize; round++) {
    for (const p of players) s.hands[p]!.push(s.drawPile.pop()!);
  }
  for (const p of players) trackHandSize(s, p);

  const dealer = opts.dealerIndex ?? rng.int(players.length);
  if (dealer < 0 || dealer >= players.length) throw new Error('dealerIndex out of range');
  events.push({ type: 'game_started', uid: players[dealer] });

  // Flip the starting card; a Wild Draw 4 goes back into the pile and we flip again.
  let flipped = s.drawPile.pop()!;
  while (flipped.value === 'wild4') {
    const at = rng.int(s.drawPile.length + 1);
    s.drawPile.splice(at, 0, flipped);
    flipped = s.drawPile.pop()!;
  }
  s.discardPile.push(flipped);
  events.push({ type: 'card_played', card: flipped });

  s.turn = dealer;
  const first = nextIndex(s, dealer);
  switch (flipped.value) {
    case 'wild':
      s.turn = first;
      s.phase = 'awaiting_color';
      break;
    case 'skip':
      s.currentColor = flipped.color as Color;
      events[events.length - 1]!.targetUid = s.players[first];
      s.turn = nextIndex(s, first);
      break;
    case 'reverse':
      // Direction flips and the dealer plays first (with 2 players this equals skipping player 1).
      s.currentColor = flipped.color as Color;
      s.direction = -1;
      s.turn = dealer;
      break;
    case 'draw2': {
      s.currentColor = flipped.color as Color;
      const victim = s.players[first]!;
      events[events.length - 1]!.targetUid = victim;
      drawCards(s, rng, events, victim, 2);
      s.turn = nextIndex(s, first);
      break;
    }
    default:
      s.currentColor = flipped.color as Color;
      s.turn = first;
  }

  s.rngState = rng.state;
  return { state: s, events };
}

// ---------------------------------------------------------------------------------------------
// applyAction
// ---------------------------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.phase === 'finished') {
    if (action.type === 'startFinalLap') return { ok: true, state, events: [], turnChanged: false };
    return fail('GAME_FINISHED');
  }

  const s = clone(state);
  const rng = new Rng(s.rngState);
  const events: EngineEvent[] = [];
  let turnChanged = false;

  // Actions by a specific player must come from someone seated and still playing.
  if ('uid' in action && !isActive(s, action.uid)) return fail('NOT_A_PLAYER');

  const isTurnAction =
    action.type === 'play' ||
    action.type === 'draw' ||
    action.type === 'pass' ||
    action.type === 'chooseColor';

  if (isTurnAction) {
    if (currentUid(s) !== action.uid) return fail('NOT_YOUR_TURN');
  }

  switch (action.type) {
    case 'play': {
      const uid = action.uid;
      if (s.phase !== 'awaiting_play' && s.phase !== 'awaiting_drawn_decision') {
        return fail('WRONG_PHASE');
      }
      if (s.phase === 'awaiting_drawn_decision' && action.cardId !== s.drawnCardId) {
        return fail('MUST_PLAY_DRAWN_CARD_OR_PASS');
      }
      const hand = s.hands[uid]!;
      const idx = hand.findIndex((c) => c.id === action.cardId);
      if (idx === -1) return fail('CARD_NOT_IN_HAND');
      const card = hand[idx]!;
      if (!isPlayable(card, hand, topCard(s), s.currentColor)) {
        return fail(card.value === 'wild4' ? 'ILLEGAL_WILD_DRAW_FOUR' : 'ILLEGAL_CARD', s);
      }
      if (isWild(card) && !action.chosenColor) return fail('COLOR_REQUIRED');

      s.unoPending = null; // any turn action closes the previous catch window
      resetInactivity(s, uid);
      hand.splice(idx, 1);
      s.discardPile.push(card);
      s.currentColor = isWild(card) ? action.chosenColor! : (card.color as Color);
      s.drawnCardId = null;

      const stats = s.stats[uid]!;
      stats.cardsPlayed++;
      stats.cardsPlayedByValue[card.value] = (stats.cardsPlayedByValue[card.value] ?? 0) + 1;
      if (card.value === 'wild4') stats.wild4Played++;
      if (card.value === 'draw2') stats.draw2Played++;

      const played: EngineEvent = { type: 'card_played', uid, card };
      if (isWild(card)) played.color = action.chosenColor!;
      events.push(played);

      if (hand.length === 1) {
        if (action.declareUno) {
          stats.unoCalls++;
          events.push({ type: 'uno_called', uid });
        } else {
          s.unoPending = uid;
        }
      }

      // Resolve the card's effect.
      const nextIdx = nextIndex(s, s.turn);
      const next = s.players[nextIdx]!;
      const twoPlayers = activePlayers(s).length === 2;
      let lostTurns = 0;
      switch (card.value) {
        case 'skip':
          played.targetUid = next;
          lostTurns = 1;
          break;
        case 'reverse':
          if (twoPlayers) {
            played.targetUid = next;
            lostTurns = 1;
          } else {
            s.direction = s.direction === 1 ? -1 : 1;
          }
          break;
        case 'draw2':
          played.targetUid = next;
          drawCards(s, rng, events, next, 2);
          lostTurns = 1;
          break;
        case 'wild4':
          played.targetUid = next;
          stats.wild4Victims[next] = (stats.wild4Victims[next] ?? 0) + 1;
          drawCards(s, rng, events, next, 4);
          lostTurns = 1;
          break;
      }

      if (hand.length === 0) {
        s.unoPending = null;
        finish(s, events, 'empty_hand');
      } else {
        endTurn(s, events, lostTurns);
        turnChanged = true;
      }
      break;
    }

    case 'draw': {
      if (s.phase !== 'awaiting_play') return fail('WRONG_PHASE');
      s.unoPending = null;
      resetInactivity(s, action.uid);
      const [card] = drawCards(s, rng, events, action.uid, 1);
      const hand = s.hands[action.uid]!;
      if (card && isPlayable(card, hand, topCard(s), s.currentColor)) {
        s.phase = 'awaiting_drawn_decision';
        s.drawnCardId = card.id;
      } else {
        events.push({ type: 'turn_passed', uid: action.uid });
        endTurn(s, events);
        turnChanged = true;
      }
      break;
    }

    case 'pass': {
      if (s.phase !== 'awaiting_drawn_decision') return fail('WRONG_PHASE');
      s.unoPending = null;
      resetInactivity(s, action.uid);
      events.push({ type: 'turn_passed', uid: action.uid });
      endTurn(s, events);
      turnChanged = true;
      break;
    }

    case 'chooseColor': {
      if (s.phase !== 'awaiting_color') return fail('WRONG_PHASE');
      s.unoPending = null;
      resetInactivity(s, action.uid);
      s.currentColor = action.color;
      s.phase = 'awaiting_play';
      events.push({ type: 'color_chosen', uid: action.uid, color: action.color });
      break;
    }

    case 'callUno': {
      if (s.unoPending !== action.uid) return fail('NO_UNO_PENDING');
      s.unoPending = null;
      resetInactivity(s, action.uid);
      s.stats[action.uid]!.unoCalls++;
      events.push({ type: 'uno_called', uid: action.uid });
      break;
    }

    case 'catchUno': {
      if (action.uid === action.targetUid) return fail('CANNOT_CATCH_SELF');
      if (!s.unoPending || s.unoPending !== action.targetUid) return fail('NO_UNO_PENDING');
      resetInactivity(s, action.uid);
      s.unoPending = null;
      s.stats[action.uid]!.catches++;
      s.stats[action.targetUid]!.timesCaught++;
      events.push({ type: 'uno_caught', uid: action.uid, targetUid: action.targetUid });
      drawCards(s, rng, events, action.targetUid, 2);
      break;
    }

    case 'timeout': {
      const uid = currentUid(s);
      s.unoPending = null;
      const timeouts = (s.consecutiveTimeouts[uid] ?? 0) + 1;
      s.consecutiveTimeouts[uid] = timeouts;
      s.stats[uid]!.timeouts++;
      if (timeouts >= s.rules.awayAfterTimeouts) s.away[uid] = true;
      events.push({ type: 'timeout', uid });

      if (s.phase === 'awaiting_color') {
        const color = mostHeldColor(s.hands[uid]!);
        s.currentColor = color;
        s.phase = 'awaiting_play';
        events.push({ type: 'color_chosen', uid, color });
      } else {
        if (s.phase === 'awaiting_play') drawCards(s, rng, events, uid, 1);
        events.push({ type: 'turn_passed', uid });
        endTurn(s, events);
      }
      // The deadline restarts either way: a new player, or the same player now choosing a card.
      turnChanged = true;
      break;
    }

    case 'startFinalLap': {
      if (s.finalLap.active) return { ok: true, state, events: [], turnChanged: false };
      const order: string[] = [];
      let idx = s.turn;
      for (let i = 0; i < s.players.length; i++) {
        const uid = s.players[idx]!;
        if (!s.forfeited.includes(uid) && !order.includes(uid)) order.push(uid);
        idx = (((idx + s.direction) % s.players.length) + s.players.length) % s.players.length;
      }
      s.finalLap = { active: true, remaining: order };
      events.push({ type: 'final_lap' });
      break;
    }

    case 'forfeit': {
      const uid = action.uid;
      const wasTurn = currentUid(s) === uid;
      s.forfeited.push(uid);
      s.drawPile.push(...s.hands[uid]!);
      s.hands[uid] = [];
      rng.shuffle(s.drawPile);
      if (s.unoPending === uid) s.unoPending = null;
      s.finalLap.remaining = s.finalLap.remaining.filter((p) => p !== uid);
      events.push({ type: 'player_forfeited', uid });

      if (activePlayers(s).length <= 1) {
        finish(s, events, 'last_player_standing');
      } else if (s.finalLap.active && s.finalLap.remaining.length === 0) {
        finish(s, events, 'final_lap');
      } else if (wasTurn) {
        s.turn = nextIndex(s, s.turn);
        s.turnCount++;
        s.drawnCardId = null;
        s.phase = s.currentColor === null ? 'awaiting_color' : 'awaiting_play';
        turnChanged = true;
      }
      break;
    }
  }

  s.rngState = rng.state;
  s.version = state.version + 1;
  return { ok: true, state: s, events, turnChanged };
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export function legalActions(state: GameState, uid: string): LegalActions {
  const none: LegalActions = {
    playableCardIds: [],
    canDraw: false,
    canPass: false,
    mustChooseColor: false,
    canCallUno: false,
    catchableUids: [],
  };
  if (state.phase === 'finished' || !isActive(state, uid)) return none;

  const result = { ...none };
  result.canCallUno = state.unoPending === uid;
  if (state.unoPending && state.unoPending !== uid) result.catchableUids = [state.unoPending];

  if (currentUid(state) !== uid) return result;

  const hand = state.hands[uid]!;
  const top = topCard(state);
  switch (state.phase) {
    case 'awaiting_play':
      result.playableCardIds = hand
        .filter((c) => isPlayable(c, hand, top, state.currentColor))
        .map((c) => c.id);
      result.canDraw = true;
      break;
    case 'awaiting_drawn_decision': {
      const drawn = hand.find((c) => c.id === state.drawnCardId);
      if (drawn && isPlayable(drawn, hand, top, state.currentColor)) {
        result.playableCardIds = [drawn.id];
      }
      result.canPass = true;
      break;
    }
    case 'awaiting_color':
      result.mustChooseColor = true;
      break;
  }
  return result;
}

/**
 * Final placement order: empty hand first, then fewest cards, then lowest hand value, then seat
 * distance (in the current direction) from the reference seat — the winner if there is one,
 * otherwise the player whose turn it is. Forfeited players come last, first-to-leave last of all.
 */
export function rankPlayers(state: GameState): Ranking[] {
  const n = state.players.length;
  const winnerIdx = state.players.findIndex(
    (p) => !state.forfeited.includes(p) && state.hands[p]!.length === 0,
  );
  const ref = winnerIdx >= 0 ? winnerIdx : state.turn;
  const distance = (uid: string) => {
    const idx = state.players.indexOf(uid);
    return ((((idx - ref) * state.direction) % n) + n) % n;
  };

  const active = activePlayers(state).map((uid) => ({
    uid,
    cardsLeft: state.hands[uid]!.length,
    handValue: handValue(state.hands[uid]!),
    distance: distance(uid),
  }));
  active.sort(
    (a, b) => a.cardsLeft - b.cardsLeft || a.handValue - b.handValue || a.distance - b.distance,
  );

  const ranked: Ranking[] = active.map((p, i) => ({
    uid: p.uid,
    place: i + 1,
    cardsLeft: p.cardsLeft,
    handValue: p.handValue,
    forfeited: false,
  }));
  [...state.forfeited].reverse().forEach((uid) => {
    ranked.push({ uid, place: ranked.length + 1, cardsLeft: 0, handValue: 0, forfeited: true });
  });
  return ranked;
}

export { mostHeldColor, topCard as getTopCard, currentUid as getCurrentUid };
