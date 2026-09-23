import type { EngineError, GameState } from './types.js';

/** Friendly, player-facing explanations for rejected moves (PRD O4). */
export function messageFor(error: EngineError, state?: GameState): string {
  const color = state?.currentColor ?? null;
  switch (error) {
    case 'NOT_YOUR_TURN':
      return "Hang on — it's not your turn yet.";
    case 'WRONG_PHASE':
      return "You can't do that right now.";
    case 'CARD_NOT_IN_HAND':
      return "That card isn't in your hand.";
    case 'ILLEGAL_CARD':
      return color
        ? `That card doesn't match. Play a ${color} card, the same number or symbol, or a Wild.`
        : "That card doesn't match the pile.";
    case 'ILLEGAL_WILD_DRAW_FOUR':
      return color
        ? `You can only play Wild Draw 4 when you have no ${color} cards.`
        : 'You can only play Wild Draw 4 when you have no cards of the current color.';
    case 'COLOR_REQUIRED':
      return 'Pick a color for your Wild.';
    case 'MUST_PLAY_DRAWN_CARD_OR_PASS':
      return 'After drawing, you can only play the card you drew — or pass.';
    case 'NO_UNO_PENDING':
      return 'Nobody needs to call UNO right now.';
    case 'CANNOT_CATCH_SELF':
      return "You can't catch yourself — call UNO instead!";
    case 'NOT_A_PLAYER':
      return "You're not playing in this game.";
    case 'GAME_FINISHED':
      return 'This game is already over.';
  }
}
