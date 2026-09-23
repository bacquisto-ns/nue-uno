import type {
  Card,
  Color,
  EndedBy,
  FinalLapState,
  GameState,
  Phase,
  PlayerGameStats,
  RulesConfig,
} from './types.js';

/** Fields everyone may see (stored in games/{gameId}). */
export interface PublicGameState {
  rules: RulesConfig;
  players: string[];
  handCounts: Record<string, number>;
  topCard: Card | null;
  currentColor: Color | null;
  direction: 1 | -1;
  turn: number;
  turnUid: string | null;
  phase: Phase;
  drawnCardPlayable: boolean;
  unoPending: string | null;
  away: Record<string, boolean>;
  forfeited: string[];
  drawPileCount: number;
  turnCount: number;
  finalLap: FinalLapState;
  placements: string[] | null;
  endedBy: EndedBy | null;
  version: number;
}

/** A single player's private hand (stored in games/{gameId}/hands/{uid}). */
export interface HandDoc {
  cards: Card[];
  drawnCardId: string | null;
  version: number;
}

/** Server-only fields (stored in games/{gameId}/private/state). */
export interface PrivateGameState {
  drawPile: Card[];
  discardPile: Card[];
  rngState: number;
  consecutiveTimeouts: Record<string, number>;
  stats: Record<string, PlayerGameStats>;
}

export function splitState(state: GameState): {
  publicDoc: PublicGameState;
  hands: Record<string, HandDoc>;
  privateDoc: PrivateGameState;
} {
  const turnUid = state.phase === 'finished' ? null : (state.players[state.turn] ?? null);
  const publicDoc: PublicGameState = {
    rules: state.rules,
    players: state.players,
    handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]!.length])),
    topCard: state.discardPile[state.discardPile.length - 1] ?? null,
    currentColor: state.currentColor,
    direction: state.direction,
    turn: state.turn,
    turnUid,
    phase: state.phase,
    drawnCardPlayable: state.phase === 'awaiting_drawn_decision' && state.drawnCardId !== null,
    unoPending: state.unoPending,
    away: state.away,
    forfeited: state.forfeited,
    drawPileCount: state.drawPile.length,
    turnCount: state.turnCount,
    finalLap: state.finalLap,
    placements: state.placements,
    endedBy: state.endedBy,
    version: state.version,
  };
  const hands = Object.fromEntries(
    state.players.map((p) => [
      p,
      {
        cards: state.hands[p]!,
        drawnCardId: p === turnUid ? state.drawnCardId : null,
        version: state.version,
      },
    ]),
  );
  const privateDoc: PrivateGameState = {
    drawPile: state.drawPile,
    discardPile: state.discardPile,
    rngState: state.rngState,
    consecutiveTimeouts: state.consecutiveTimeouts,
    stats: state.stats,
  };
  return { publicDoc, hands, privateDoc };
}

export function joinState(
  publicDoc: PublicGameState,
  hands: Record<string, Pick<HandDoc, 'cards' | 'drawnCardId'>>,
  privateDoc: PrivateGameState,
): GameState {
  const turnUid = publicDoc.players[publicDoc.turn];
  return {
    rules: publicDoc.rules,
    players: publicDoc.players,
    hands: Object.fromEntries(publicDoc.players.map((p) => [p, hands[p]?.cards ?? []])),
    drawPile: privateDoc.drawPile,
    discardPile: privateDoc.discardPile,
    currentColor: publicDoc.currentColor,
    direction: publicDoc.direction,
    turn: publicDoc.turn,
    phase: publicDoc.phase,
    drawnCardId: (turnUid && hands[turnUid]?.drawnCardId) || null,
    unoPending: publicDoc.unoPending,
    consecutiveTimeouts: privateDoc.consecutiveTimeouts,
    away: publicDoc.away,
    forfeited: publicDoc.forfeited,
    turnCount: publicDoc.turnCount,
    finalLap: publicDoc.finalLap,
    stats: privateDoc.stats,
    rngState: privateDoc.rngState,
    placements: publicDoc.placements,
    endedBy: publicDoc.endedBy,
    version: publicDoc.version,
  };
}
