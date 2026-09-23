import type { Color } from '@nue-uno/engine';
import { call } from './call';

type MoveBase = { gameId: string; expectedVersion: number; clientMoveId: string };
type MoveResult = { ok: true; version: number; duplicate?: true };

const base = (gameId: string, expectedVersion: number): MoveBase => ({
  gameId,
  expectedVersion,
  clientMoveId: crypto.randomUUID(),
});

/** Typed wrappers for the callables in docs/engineering/api.md. */
export const gameApi = {
  createTable: (maxSeats: number, requestedMode: 'casual' | 'ranked') =>
    call<{ maxSeats: number; requestedMode: string }, { gameId: string }>('createTable', { maxSeats, requestedMode }),
  joinTable: (gameId: string) => call<{ gameId: string }, { ok: true; started: boolean }>('joinTable', { gameId }),
  leaveTable: (gameId: string) => call<{ gameId: string }, { ok: true }>('leaveTable', { gameId }),
  startGame: (gameId: string) => call<{ gameId: string }, { ok: true; mode: string }>('startGame', { gameId }),
  quickMatch: () => call<Record<string, never>, { gameId: string }>('quickMatch', {}),

  playCard: (gameId: string, v: number, cardId: string, o: { chosenColor?: Color; declareUno?: boolean }) =>
    call<MoveBase & { cardId: string; chosenColor?: Color; declareUno?: boolean }, MoveResult>('playCard', {
      ...base(gameId, v),
      cardId,
      ...(o.chosenColor ? { chosenColor: o.chosenColor } : {}),
      ...(o.declareUno ? { declareUno: true } : {}),
    }),
  drawCard: (gameId: string, v: number) => call<MoveBase, MoveResult>('drawCard', base(gameId, v)),
  passTurn: (gameId: string, v: number) => call<MoveBase, MoveResult>('passTurn', base(gameId, v)),
  chooseColor: (gameId: string, v: number, color: Color) =>
    call<MoveBase & { color: Color }, MoveResult>('chooseColor', { ...base(gameId, v), color }),
  callUno: (gameId: string, v: number) => call<MoveBase, MoveResult>('callUno', base(gameId, v)),
  catchUno: (gameId: string, v: number, targetUid: string) =>
    call<MoveBase & { targetUid: string }, MoveResult>('catchUno', { ...base(gameId, v), targetUid }),
  leaveGame: (gameId: string, v: number) => call<MoveBase, MoveResult>('leaveGame', base(gameId, v)),
  claimTimeout: (gameId: string, expectedVersion: number) =>
    call<{ gameId: string; expectedVersion: number }, MoveResult>('claimTimeout', { gameId, expectedVersion }),
};
