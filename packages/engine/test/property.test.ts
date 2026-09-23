import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  botAction,
  createGame,
  createRandom,
  legalActions,
  splitState,
  COLORS,
  type Action,
  type GameState,
} from '../src/index.js';
import { allCardIds, totalCards } from './helpers.js';

function assertInvariants(s: GameState): void {
  expect(totalCards(s)).toBe(108);
  expect(new Set(allCardIds(s)).size).toBe(108);
  const { publicDoc } = splitState(s);
  for (const p of s.players) expect(publicDoc.handCounts[p]).toBe(s.hands[p]!.length);
  for (const p of s.forfeited) expect(s.hands[p]).toHaveLength(0);
  if (s.phase !== 'finished') expect(s.forfeited).not.toContain(s.players[s.turn]);
}

/** Pick a random legal action for any player (including out-of-turn UNO calls and catches). */
function randomAction(s: GameState, random: () => number): Action {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)]!;
  const roll = random();
  if (roll < 0.01) {
    const active = s.players.filter((p) => !s.forfeited.includes(p));
    return { type: 'forfeit', uid: pick(active) };
  }
  if (roll < 0.05) return { type: 'timeout' };

  for (const uid of s.players) {
    const legal = legalActions(s, uid);
    if (legal.canCallUno && random() < 0.5) return { type: 'callUno', uid };
    if (legal.catchableUids.length && random() < 0.3) {
      return { type: 'catchUno', uid, targetUid: legal.catchableUids[0]! };
    }
  }

  const uid = s.players[s.turn]!;
  const legal = legalActions(s, uid);
  if (legal.mustChooseColor) return { type: 'chooseColor', uid, color: pick(COLORS) };
  if (legal.playableCardIds.length && random() < 0.8) {
    return {
      type: 'play',
      uid,
      cardId: pick(legal.playableCardIds),
      chosenColor: pick(COLORS),
      declareUno: random() < 0.5,
    };
  }
  if (legal.canPass) return { type: 'pass', uid };
  return { type: 'draw', uid };
}

describe('property: random legal play', () => {
  it('never breaks card conservation, and every game finishes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        fc.integer(),
        fc.integer(),
        (players, seed, actionSeed) => {
          const ids = ['a', 'b', 'c', 'd'].slice(0, players);
          let s = createGame(ids, seed).state;
          const random = createRandom(actionSeed);
          assertInvariants(s);
          for (let i = 0; i < 2000 && s.phase !== 'finished'; i++) {
            // Force the time cap eventually, like the server would.
            const action: Action = i === 600 ? { type: 'startFinalLap' } : randomAction(s, random);
            const res = applyAction(s, action);
            expect(res.ok).toBe(true);
            if (res.ok) s = res.state;
            assertInvariants(s);
          }
          expect(s.phase).toBe('finished');
          expect(s.placements).toHaveLength(players);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('property: bots', () => {
  const playBots = (seed: number, botSeed: number, n: number) => {
    const ids = ['a', 'b', 'c', 'd'].slice(0, n);
    let s = createGame(ids, seed).state;
    const random = createRandom(botSeed);
    for (let i = 0; i < 3000 && s.phase !== 'finished'; i++) {
      if (i === 800) s = (applyAction(s, { type: 'startFinalLap' }) as { state: GameState }).state;
      // Give each bot a chance to catch, then the player on turn acts.
      let action: Action | null = null;
      for (const uid of ids) {
        const a = botAction(s, uid, random);
        if (a && a.type === 'catchUno') {
          action = a;
          break;
        }
      }
      action ??= botAction(s, s.players[s.turn]!, random);
      if (!action) throw new Error('bot on turn returned no action');
      const res = applyAction(s, action);
      if (!res.ok) throw new Error(`bot made an illegal move: ${res.error}`);
      s = res.state;
    }
    return s;
  };

  it('always choose legal actions and finish the game', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), fc.integer(), fc.integer(), (n, seed, botSeed) => {
        const s = playBots(seed, botSeed, n);
        expect(s.phase).toBe('finished');
        assertInvariants(s);
      }),
      { numRuns: 300 },
    );
  });

  it('are deterministic for the same seeds', () => {
    expect(playBots(7, 11, 4)).toEqual(playBots(7, 11, 4));
  });

  it('tutorial bots always declare UNO and never catch', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        let s = createGame(['a', 'b', 'c'], seed).state;
        const random = createRandom(seed);
        for (let i = 0; i < 3000 && s.phase !== 'finished'; i++) {
          if (i === 800) s = (applyAction(s, { type: 'startFinalLap' }) as { state: GameState }).state;
          for (const uid of s.players) {
            if (uid !== s.players[s.turn]) expect(botAction(s, uid, random, 'tutorial')).toBeNull();
          }
          const res = applyAction(s, botAction(s, s.players[s.turn]!, random, 'tutorial')!);
          if (!res.ok) throw new Error(res.error);
          expect(res.state.unoPending).toBeNull();
          s = res.state;
        }
        expect(s.phase).toBe('finished');
      }),
      { numRuns: 100 },
    );
  });
});
