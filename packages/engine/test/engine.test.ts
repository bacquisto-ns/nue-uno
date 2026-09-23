import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cardPoints,
  createDeck,
  createGame,
  handValue,
  joinState,
  legalActions,
  messageFor,
  rankPlayers,
  splitState,
  type EngineError,
} from '../src/index.js';
import { act, allCardIds, applyOk, setup, totalCards, turnOf } from './helpers.js';

const fill = (n: number, color = 'y') => Array.from({ length: n }, (_, i) => `${color}${i % 10}`);

describe('deck', () => {
  it('has the standard 108-card composition with unique ids', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((d) => d.id)).size).toBe(108);
    for (const color of ['red', 'yellow', 'green', 'blue']) {
      const ofColor = deck.filter((d) => d.color === color);
      expect(ofColor).toHaveLength(25);
      expect(ofColor.filter((d) => d.value === '0')).toHaveLength(1);
      expect(ofColor.filter((d) => d.value === '7')).toHaveLength(2);
      expect(ofColor.filter((d) => d.value === 'skip')).toHaveLength(2);
    }
    expect(deck.filter((d) => d.value === 'wild')).toHaveLength(4);
    expect(deck.filter((d) => d.value === 'wild4')).toHaveLength(4);
  });

  it('scores cards by official point values', () => {
    const deck = createDeck();
    const byValue = (v: string) => deck.find((d) => d.value === v)!;
    expect(cardPoints(byValue('7'))).toBe(7);
    expect(cardPoints(byValue('skip'))).toBe(20);
    expect(cardPoints(byValue('wild4'))).toBe(50);
    expect(handValue([byValue('3'), byValue('draw2'), byValue('wild')])).toBe(73);
  });
});

describe('createGame', () => {
  it('deals 7 each from a seeded shuffle and conserves all 108 cards', () => {
    const { state, events } = createGame(['a', 'b', 'c', 'd'], 123);
    const flippedDraw2 = state.discardPile[0]!.value === 'draw2' ? 2 : 0;
    const dealt = state.players.reduce((n, p) => n + state.hands[p]!.length, 0);
    expect(dealt).toBe(28 + flippedDraw2);
    for (const p of state.players) expect(state.hands[p]!.length).toBeGreaterThanOrEqual(7);
    expect(totalCards(state)).toBe(108);
    expect(new Set(allCardIds(state)).size).toBe(108);
    expect(events[0]!.type).toBe('game_started');
    expect(state.discardPile.at(-1)!.value).not.toBe('wild4');
  });

  it('is deterministic for a seed', () => {
    const a = createGame(['a', 'b', 'c'], 99).state;
    const b = createGame(['a', 'b', 'c'], 99).state;
    const c = createGame(['a', 'b', 'c'], 100).state;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('rejects bad player lists and dealer indexes', () => {
    expect(() => createGame(['solo'], 1)).toThrow();
    expect(() => createGame(['a', 'a'], 1)).toThrow();
    expect(() => createGame(['a', 'b'], 1, { dealerIndex: 5 })).toThrow();
  });

  it('number flip: seat after the dealer starts with that color', () => {
    const { state } = setup({ hands: [['r1'], ['g2'], ['b3']], flip: 'y5' });
    expect(turnOf(state)).toBe('p0');
    expect(state.currentColor).toBe('yellow');
    expect(state.phase).toBe('awaiting_play');
  });

  it('skip flip: the first player is skipped', () => {
    const { state } = setup({ hands: [['r1'], ['g2'], ['b3']], flip: 'yS' });
    expect(turnOf(state)).toBe('p1');
  });

  it('reverse flip: direction flips and the dealer plays first', () => {
    const { state } = setup({ hands: [['r1'], ['g2'], ['b3']], flip: 'yR' });
    expect(state.direction).toBe(-1);
    expect(turnOf(state)).toBe('p2');
  });

  it('reverse flip with 2 players: dealer plays first', () => {
    const { state } = setup({ hands: [['r1'], ['g2']], flip: 'yR' });
    expect(turnOf(state)).toBe('p1');
  });

  it('draw two flip: first player draws 2 and is skipped', () => {
    const { state } = setup({ hands: [['r1'], ['g2'], ['b3']], flip: 'yD', draw: ['r7', 'r8'] });
    expect(state.hands.p0).toHaveLength(3);
    expect(turnOf(state)).toBe('p1');
  });

  it('wild flip: first player chooses the color, then plays', () => {
    const { state } = setup({ hands: [['r1'], ['g2'], ['b3']], flip: 'W' });
    expect(state.phase).toBe('awaiting_color');
    expect(state.currentColor).toBeNull();
    expect(applyAction(state, { type: 'chooseColor', uid: 'p1', color: 'red' })).toMatchObject({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    const res = applyOk(state, { type: 'chooseColor', uid: 'p0', color: 'blue' });
    expect(res.state.currentColor).toBe('blue');
    expect(res.state.phase).toBe('awaiting_play');
    expect(turnOf(res.state)).toBe('p0');
    expect(res.state.turnCount).toBe(0);
  });

  it('wild draw four flip is returned to the pile and a new card flipped', () => {
    const { state } = setup({ hands: [['r1'], ['g2']], flip: 'W4', draw: ['r3', 'g4', 'b5'] });
    expect(state.discardPile).toHaveLength(1);
    expect(state.discardPile[0]!.value).not.toBe('wild4');
    expect(state.drawPile.some((d) => d.value === 'wild4')).toBe(true);
    expect(totalCards(state)).toBe(2 + 1 + 3);
  });
});

describe('playing cards', () => {
  const base = () =>
    setup({
      hands: [['r9', 'g5', 'b1', 'W', 'W4'], fill(5), fill(5, 'g')],
      flip: 'r5',
      draw: fill(10, 'b'),
    });

  it('accepts color and value matches', () => {
    const { state, hands } = base();
    expect(applyAction(state, { type: 'play', uid: 'p0', cardId: hands[0]![1]!.id }).ok).toBe(true);
    expect(applyAction(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id }).ok).toBe(true);
  });

  it('rejects a non-matching card with a friendly message', () => {
    const { state, hands } = base();
    const res = applyAction(state, { type: 'play', uid: 'p0', cardId: hands[0]![2]!.id });
    expect(res).toMatchObject({ ok: false, error: 'ILLEGAL_CARD' });
    if (!res.ok) expect(res.message).toContain('red');
  });

  it('requires a color for wilds and applies it', () => {
    const { state, hands } = base();
    const wild = hands[0]![3]!.id;
    expect(applyAction(state, { type: 'play', uid: 'p0', cardId: wild })).toMatchObject({
      error: 'COLOR_REQUIRED',
    });
    const res = applyOk(state, { type: 'play', uid: 'p0', cardId: wild, chosenColor: 'blue' });
    expect(res.state.currentColor).toBe('blue');
    expect(res.events[0]).toMatchObject({ type: 'card_played', color: 'blue' });
    expect(turnOf(res.state)).toBe('p1');
  });

  it('refuses Wild Draw 4 while holding the current color', () => {
    const { state, hands } = base();
    const res = applyAction(state, {
      type: 'play',
      uid: 'p0',
      cardId: hands[0]![4]!.id,
      chosenColor: 'green',
    });
    expect(res).toMatchObject({ ok: false, error: 'ILLEGAL_WILD_DRAW_FOUR' });
    if (!res.ok) expect(res.message).toBe('You can only play Wild Draw 4 when you have no red cards.');
  });

  it('allows Wild Draw 4 with no current-color cards: next player draws 4 and is skipped', () => {
    const { state, hands } = setup({
      hands: [['g1', 'b2', 'W4'], fill(3), fill(3, 'g')],
      flip: 'r5',
      draw: fill(6, 'b'),
    });
    const res = applyOk(state, {
      type: 'play',
      uid: 'p0',
      cardId: hands[0]![2]!.id,
      chosenColor: 'green',
    });
    expect(res.state.hands.p1).toHaveLength(7);
    expect(turnOf(res.state)).toBe('p2');
    expect(res.state.currentColor).toBe('green');
    expect(res.state.stats.p0!.wild4Played).toBe(1);
    expect(res.state.stats.p0!.wild4Victims).toEqual({ p1: 1 });
    expect(res.state.stats.p1!.cardsDrawn).toBe(4);
    expect(res.state.stats.p1!.maxHandSize).toBe(7);
    expect(res.events.find((e) => e.type === 'card_played')!.targetUid).toBe('p1');
  });

  it('rejects out-of-turn plays, unknown cards and non-players', () => {
    const { state, hands } = base();
    expect(applyAction(state, { type: 'play', uid: 'p1', cardId: hands[1]![0]!.id })).toMatchObject({
      error: 'NOT_YOUR_TURN',
    });
    expect(applyAction(state, { type: 'play', uid: 'p0', cardId: 'nope' })).toMatchObject({
      error: 'CARD_NOT_IN_HAND',
    });
    expect(applyAction(state, { type: 'draw', uid: 'stranger' })).toMatchObject({
      error: 'NOT_A_PLAYER',
    });
  });

  it('does not mutate the input state and bumps version', () => {
    const { state, hands } = base();
    const snapshot = structuredClone(state);
    const res = applyOk(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(state).toEqual(snapshot);
    expect(res.state.version).toBe(state.version + 1);
  });
});

describe('action card effects', () => {
  const four = (p0: string[]) =>
    setup({
      hands: [p0, fill(2), fill(2, 'g'), fill(2, 'b')],
      flip: 'r5',
      draw: fill(8, 'y'),
    });

  it('skip: next player loses their turn', () => {
    const { state, hands } = four(['rS', 'g1']);
    const res = applyOk(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(turnOf(res.state)).toBe('p2');
    expect(res.state.turnCount).toBe(2);
    expect(res.events[0]!.targetUid).toBe('p1');
  });

  it('reverse with 3+ players flips direction', () => {
    const { state, hands } = four(['rR', 'g1']);
    const res = applyOk(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(res.state.direction).toBe(-1);
    expect(turnOf(res.state)).toBe('p3');
  });

  it('reverse with 2 players acts as a skip', () => {
    const { state, hands } = setup({ hands: [['rR', 'g1'], fill(2)], flip: 'r5' });
    const res = applyOk(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(turnOf(res.state)).toBe('p0');
    expect(res.state.direction).toBe(1);
  });

  it('draw two: next player draws 2 and is skipped', () => {
    const { state, hands } = four(['rD', 'g1']);
    const res = applyOk(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(res.state.hands.p1).toHaveLength(4);
    expect(turnOf(res.state)).toBe('p2');
    expect(res.state.stats.p0!.draw2Played).toBe(1);
  });

  it('wraps around the table', () => {
    const { state, hands } = setup({
      hands: [fill(2), fill(2, 'g'), fill(2, 'b'), ['r1', 'r2']],
      flip: 'r5',
      dealerIndex: 2,
    });
    expect(turnOf(state)).toBe('p3');
    const res = applyOk(state, { type: 'play', uid: 'p3', cardId: hands[3]![0]!.id });
    expect(turnOf(res.state)).toBe('p0');
  });

  it('skips forfeited seats', () => {
    const { state, hands } = four(['r1', 'g1']);
    const afterForfeit = act(state, { type: 'forfeit', uid: 'p1' });
    const res = applyOk(afterForfeit, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(turnOf(res.state)).toBe('p2');
  });
});

describe('drawing', () => {
  it('drawing an unplayable card passes the turn', () => {
    const { state } = setup({ hands: [['g2', 'y3'], fill(2), fill(2, 'g')], flip: 'r5', draw: ['b1'] });
    const res = applyOk(state, { type: 'draw', uid: 'p0' });
    expect(res.state.hands.p0).toHaveLength(3);
    expect(turnOf(res.state)).toBe('p1');
    expect(res.events.map((e) => e.type)).toEqual(['cards_drawn', 'turn_passed']);
    expect(res.turnChanged).toBe(true);
  });

  it('drawing a playable card lets the player play it or pass', () => {
    const { state, hands, draw } = setup({
      hands: [['g2', 'y3'], fill(2), fill(2, 'g')],
      flip: 'r5',
      draw: ['r7'],
    });
    const drawn = applyOk(state, { type: 'draw', uid: 'p0' });
    expect(drawn.state.phase).toBe('awaiting_drawn_decision');
    expect(drawn.state.drawnCardId).toBe(draw[0]!.id);
    expect(drawn.turnChanged).toBe(false);
    expect(legalActions(drawn.state, 'p0')).toMatchObject({
      playableCardIds: [draw[0]!.id],
      canPass: true,
      canDraw: false,
    });

    expect(
      applyAction(drawn.state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id }),
    ).toMatchObject({ error: 'MUST_PLAY_DRAWN_CARD_OR_PASS' });
    expect(applyAction(drawn.state, { type: 'draw', uid: 'p0' })).toMatchObject({
      error: 'WRONG_PHASE',
    });

    const passed = applyOk(drawn.state, { type: 'pass', uid: 'p0' });
    expect(turnOf(passed.state)).toBe('p1');
    expect(passed.state.hands.p0).toHaveLength(3);

    const played = applyOk(drawn.state, { type: 'play', uid: 'p0', cardId: draw[0]!.id });
    expect(played.state.hands.p0).toHaveLength(2);
    expect(played.state.discardPile.at(-1)!.id).toBe(draw[0]!.id);
  });

  it('pass and chooseColor are only valid in their phases', () => {
    const { state } = setup({ hands: [['g2'], ['y1']], flip: 'r5' });
    expect(applyAction(state, { type: 'pass', uid: 'p0' })).toMatchObject({ error: 'WRONG_PHASE' });
    expect(applyAction(state, { type: 'chooseColor', uid: 'p0', color: 'red' })).toMatchObject({
      error: 'WRONG_PHASE',
    });
    const wild = setup({ hands: [['g2'], ['y1']], flip: 'W' }).state;
    expect(applyAction(wild, { type: 'draw', uid: 'p0' })).toMatchObject({ error: 'WRONG_PHASE' });
    expect(applyAction(wild, { type: 'play', uid: 'p0', cardId: 'x' })).toMatchObject({
      error: 'WRONG_PHASE',
    });
  });

  it('reshuffles the discard pile (except the top card) when the draw pile is empty', () => {
    const { state, hands } = setup({ hands: [['r1', 'r2'], ['g3', 'g4']], flip: 'r5' });
    expect(state.drawPile).toHaveLength(0);
    const s1 = act(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    const res = applyOk(s1, { type: 'draw', uid: 'p1' });
    expect(res.events[0]).toMatchObject({ type: 'deck_reshuffled', count: 1 });
    expect(res.state.discardPile.map((d) => d.id)).toEqual([hands[0]![0]!.id]);
    expect(res.state.phase).toBe('awaiting_drawn_decision'); // drew the red 5
  });

  it('passes the turn if nothing can be drawn at all', () => {
    const { state } = setup({ hands: [['g1', 'g2'], ['b1', 'b2']], flip: 'r5' });
    const res = applyOk(state, { type: 'draw', uid: 'p0' });
    expect(res.events.map((e) => e.type)).toEqual(['turn_passed']);
    expect(turnOf(res.state)).toBe('p1');
  });
});

describe('UNO call and catch', () => {
  const uno = () =>
    setup({
      hands: [['r1', 'r2'], ['g1', 'g2'], ['y1', 'y2']],
      flip: 'r5',
      draw: ['b7', 'b8', 'b9'],
    });

  it('declaring with the play records the call', () => {
    const { state, hands } = uno();
    const res = applyOk(state, {
      type: 'play',
      uid: 'p0',
      cardId: hands[0]![0]!.id,
      declareUno: true,
    });
    expect(res.state.unoPending).toBeNull();
    expect(res.events.map((e) => e.type)).toContain('uno_called');
    expect(res.state.stats.p0!.unoCalls).toBe(1);
  });

  it('forgetting opens a catch window; late call closes it', () => {
    const { state, hands } = uno();
    const s1 = act(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(s1.unoPending).toBe('p0');
    expect(legalActions(s1, 'p0').canCallUno).toBe(true);
    expect(legalActions(s1, 'p2').catchableUids).toEqual(['p0']);
    const called = act(s1, { type: 'callUno', uid: 'p0' });
    expect(called.unoPending).toBeNull();
    expect(applyAction(called, { type: 'callUno', uid: 'p0' })).toMatchObject({
      error: 'NO_UNO_PENDING',
    });
  });

  it('a catch makes the offender draw 2', () => {
    const { state, hands } = uno();
    const s1 = act(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(applyAction(s1, { type: 'catchUno', uid: 'p0', targetUid: 'p0' })).toMatchObject({
      error: 'CANNOT_CATCH_SELF',
    });
    const res = applyOk(s1, { type: 'catchUno', uid: 'p2', targetUid: 'p0' });
    expect(res.state.hands.p0).toHaveLength(3);
    expect(res.state.unoPending).toBeNull();
    expect(res.state.stats.p2!.catches).toBe(1);
    expect(res.state.stats.p0!.timesCaught).toBe(1);
    expect(res.turnChanged).toBe(false);
    expect(turnOf(res.state)).toBe('p1');
  });

  it("the window closes when the next player acts", () => {
    const { state, hands } = uno();
    const s1 = act(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    const s2 = act(s1, { type: 'draw', uid: 'p1' });
    expect(s2.unoPending).toBeNull();
    expect(applyAction(s2, { type: 'catchUno', uid: 'p2', targetUid: 'p0' })).toMatchObject({
      error: 'NO_UNO_PENDING',
    });
  });
});

describe('timeouts', () => {
  it('awaiting play: draws one and passes', () => {
    const { state } = setup({ hands: [['g2'], ['y1'], ['b1']], flip: 'r5', draw: ['r9'] });
    const res = applyOk(state, { type: 'timeout' });
    expect(res.state.hands.p0).toHaveLength(2); // drawn card is never auto-played
    expect(turnOf(res.state)).toBe('p1');
    expect(res.state.consecutiveTimeouts.p0).toBe(1);
    expect(res.state.stats.p0!.timeouts).toBe(1);
    expect(res.events.map((e) => e.type)).toEqual(['timeout', 'cards_drawn', 'turn_passed']);
    expect(res.turnChanged).toBe(true);
  });

  it('awaiting drawn decision: passes', () => {
    const { state } = setup({ hands: [['g2'], ['y1'], ['b1']], flip: 'r5', draw: ['r9'] });
    const drawn = act(state, { type: 'draw', uid: 'p0' });
    const res = applyOk(drawn, { type: 'timeout' });
    expect(turnOf(res.state)).toBe('p1');
    expect(res.state.hands.p0).toHaveLength(2);
  });

  it('awaiting color: picks the most-held color and keeps the turn', () => {
    const { state } = setup({ hands: [['b1', 'b2', 'g3'], fill(3), fill(3)], flip: 'W' });
    const res = applyOk(state, { type: 'timeout' });
    expect(res.state.currentColor).toBe('blue');
    expect(res.state.phase).toBe('awaiting_play');
    expect(turnOf(res.state)).toBe('p0');
    expect(res.turnChanged).toBe(true);
  });

  it('marks a player away after 3 in a row and clears it on a real action', () => {
    const { state } = setup({ hands: [['g2', 'g3'], ['y1', 'y2']], flip: 'r5', draw: fill(6, 'b') });
    state.consecutiveTimeouts.p0 = 2;
    const away = act(state, { type: 'timeout' });
    expect(away.away.p0).toBe(true);
    const back = act(act(away, { type: 'draw', uid: 'p1' }), { type: 'draw', uid: 'p0' });
    expect(back.away.p0).toBe(false);
    expect(back.consecutiveTimeouts.p0).toBe(0);
  });
});

describe('turn counting', () => {
  it('counts passes and lost turns but not UNO calls or color choices', () => {
    const { state, hands } = setup({
      hands: [['rS', 'r1', 'r2'], ['r3', 'g1', 'g2'], ['y1', 'y2', 'y3']],
      flip: 'W',
      draw: ['b1'],
    });
    const s1 = act(state, { type: 'chooseColor', uid: 'p0', color: 'red' });
    expect(s1.turnCount).toBe(0);
    const s2 = act(s1, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(s2.turnCount).toBe(2); // p0's turn + p1's lost turn
    const s3 = act(s2, { type: 'draw', uid: 'p2' });
    expect(s3.turnCount).toBe(3);
  });
});

describe('final lap', () => {
  const lap = () =>
    setup({
      hands: [
        ['r1', 'rS', 'g9'],
        ['r2', 'g1', 'g2'],
        ['r3', 'b4', 'b5'],
        ['r4', 'y1', 'y2'],
      ],
      flip: 'r5',
      draw: fill(10, 'b'),
    });

  it('starts from the current player and is idempotent', () => {
    const { state } = lap();
    const res = applyOk(state, { type: 'startFinalLap' });
    expect(res.state.finalLap).toEqual({ active: true, remaining: ['p0', 'p1', 'p2', 'p3'] });
    expect(res.events).toEqual([{ type: 'final_lap' }]);
    const again = applyOk(res.state, { type: 'startFinalLap' });
    expect(again.state).toBe(res.state);
    expect(again.events).toEqual([]);
  });

  it('ends after everyone has taken one more turn, ranked by cards', () => {
    const { state, hands } = lap();
    let s = act(state, { type: 'startFinalLap' });
    s = act(s, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(s.finalLap.remaining).toEqual(['p1', 'p2', 'p3']);
    s = act(s, { type: 'play', uid: 'p1', cardId: hands[1]![0]!.id });
    s = act(s, { type: 'draw', uid: 'p2' }); // draws a blue: unplayable on red → passes
    const res = applyOk(s, { type: 'play', uid: 'p3', cardId: hands[3]![0]!.id });
    expect(res.state.phase).toBe('finished');
    expect(res.state.endedBy).toBe('final_lap');
    expect(res.state.placements![3]).toBe('p2'); // p2 holds 4 cards
    expect(res.events.at(-1)!.type).toBe('game_finished');
  });

  it('a skipped player loses their last turn', () => {
    const { state, hands } = lap();
    let s = act(state, { type: 'startFinalLap' });
    s = act(s, { type: 'play', uid: 'p0', cardId: hands[0]![1]!.id });
    expect(s.finalLap.remaining).toEqual(['p2', 'p3']);
  });

  it('a forfeit removes the player from the lap', () => {
    const { state } = lap();
    let s = act(state, { type: 'startFinalLap' });
    s = act(s, { type: 'forfeit', uid: 'p2' });
    expect(s.finalLap.remaining).toEqual(['p0', 'p1', 'p3']);
  });

  it('emptying a hand during the lap still wins outright', () => {
    const { state, hands } = setup({ hands: [['r1'], ['g1'], ['y1']], flip: 'r5' });
    let s = act(state, { type: 'startFinalLap' });
    s = act(s, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(s.endedBy).toBe('empty_hand');
    expect(s.placements![0]).toBe('p0');
  });

  it('respects direction when building the lap order', () => {
    const { state, hands } = lap();
    const reversed = act(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    const r = { ...reversed, direction: -1 as const };
    const res = applyOk(r, { type: 'startFinalLap' });
    expect(res.state.finalLap.remaining).toEqual(['p1', 'p0', 'p3', 'p2']);
  });
});

describe('game end and placements', () => {
  it('a final draw two still makes the next player draw', () => {
    const { state, hands } = setup({ hands: [['rD'], ['g1'], ['y1']], flip: 'r5', draw: ['b1', 'b2'] });
    const res = applyOk(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(res.state.phase).toBe('finished');
    expect(res.state.hands.p1).toHaveLength(3);
    expect(res.state.placements).toEqual(['p0', 'p2', 'p1']);
    expect(res.state.endedBy).toBe('empty_hand');
    expect(res.turnChanged).toBe(false);
  });

  it('breaks ties by hand value, then by seat distance', () => {
    const byValue = setup({
      hands: [['r1', 'g1', 'g2'], ['r2', 'W', 'b1'], ['r3', 'g4', 'b4']],
      flip: 'r5',
    });
    let s = act(byValue.state, { type: 'startFinalLap' });
    for (const [p, idx] of [[0, 0], [1, 0], [2, 0]] as const) {
      s = act(s, { type: 'play', uid: `p${p}`, cardId: byValue.hands[p]![idx]!.id });
    }
    expect(s.placements).toEqual(['p0', 'p2', 'p1']);

    const byDistance = setup({ hands: [['r1', 'g2'], ['r2', 'b2'], ['r3', 'y2']], flip: 'r5' });
    let t = act(byDistance.state, { type: 'startFinalLap' });
    for (const p of [0, 1, 2]) {
      t = act(t, { type: 'play', uid: `p${p}`, cardId: byDistance.hands[p]![0]!.id });
    }
    expect(turnOf(t)).toBe('p0');
    expect(t.placements).toEqual(['p0', 'p1', 'p2']);
    expect(rankPlayers(t).map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it('forfeits: hand returns to the deck, first to leave finishes last', () => {
    const { state } = setup({
      hands: [fill(2), fill(2, 'g'), fill(2, 'b'), fill(2)],
      flip: 'r5',
      draw: fill(4, 'g'),
    });
    const before = totalCards(state);
    let s = act(state, { type: 'forfeit', uid: 'p1' });
    expect(s.hands.p1).toHaveLength(0);
    expect(totalCards(s)).toBe(before);
    s = act(s, { type: 'forfeit', uid: 'p3' });
    expect(applyAction(s, { type: 'draw', uid: 'p3' })).toMatchObject({ error: 'NOT_A_PLAYER' });
    const res = applyOk(s, { type: 'forfeit', uid: 'p2' });
    expect(res.state.endedBy).toBe('last_player_standing');
    expect(res.state.placements).toEqual(['p0', 'p2', 'p3', 'p1']);
    expect(rankPlayers(res.state).filter((r) => r.forfeited)).toHaveLength(3);
    expect(applyAction(res.state, { type: 'draw', uid: 'p0' })).toMatchObject({
      error: 'GAME_FINISHED',
    });
    expect(applyOk(res.state, { type: 'startFinalLap' }).state).toBe(res.state);
  });

  it('forfeiting on your turn passes play on (keeping a pending color choice)', () => {
    const onTurn = setup({ hands: [fill(2), fill(2, 'g'), fill(2, 'b')], flip: 'r5' });
    const res = applyOk(onTurn.state, { type: 'forfeit', uid: 'p0' });
    expect(turnOf(res.state)).toBe('p1');
    expect(res.turnChanged).toBe(true);

    const wild = setup({ hands: [fill(2), fill(2, 'g'), fill(2, 'b')], flip: 'W' });
    const w = applyOk(wild.state, { type: 'forfeit', uid: 'p0' });
    expect(turnOf(w.state)).toBe('p1');
    expect(w.state.phase).toBe('awaiting_color');
  });

  it('forfeit ends a final lap when nobody else is left to play', () => {
    const { state, hands } = setup({ hands: [['r1', 'g1'], ['r2', 'g2'], ['r3', 'g3']], flip: 'r5' });
    let s = act(state, { type: 'startFinalLap' });
    s = act(s, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    s = act(s, { type: 'play', uid: 'p1', cardId: hands[1]![0]!.id });
    const res = applyOk(s, { type: 'forfeit', uid: 'p2' });
    expect(res.state.endedBy).toBe('final_lap');
    expect(res.state.placements!.at(-1)).toBe('p2');
  });

  it('a pending UNO is cleared if that player forfeits', () => {
    const { state, hands } = setup({ hands: [['r1', 'r2'], ['g1', 'g2'], ['y1', 'y2']], flip: 'r5' });
    const s1 = act(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(act(s1, { type: 'forfeit', uid: 'p0' }).unoPending).toBeNull();
  });
});

describe('legalActions', () => {
  it('returns nothing for non-players and finished games', () => {
    const { state, hands } = setup({ hands: [['r1'], ['g1']], flip: 'r5' });
    expect(legalActions(state, 'ghost').canDraw).toBe(false);
    const done = act(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    expect(legalActions(done, 'p1')).toMatchObject({ canDraw: false, playableCardIds: [] });
  });

  it('lists playable cards and color choice', () => {
    const { state, hands } = setup({ hands: [['r1', 'g2', 'W4'], fill(3)], flip: 'r5' });
    expect(legalActions(state, 'p0').playableCardIds).toEqual([hands[0]![0]!.id]);
    expect(legalActions(state, 'p1')).toMatchObject({ playableCardIds: [], canDraw: false });
    const wild = setup({ hands: [['r1'], ['g1']], flip: 'W' }).state;
    expect(legalActions(wild, 'p0').mustChooseColor).toBe(true);
  });
});

describe('serialization', () => {
  it('split → join round-trips the full state', () => {
    const { state, hands } = setup({
      hands: [['g2', 'y3'], fill(2), fill(2, 'g')],
      flip: 'r5',
      draw: ['r7', 'b1'],
    });
    const drawn = act(state, { type: 'draw', uid: 'p0' });
    const { publicDoc, hands: handDocs, privateDoc } = splitState(drawn);
    expect(publicDoc.handCounts).toEqual({ p0: 3, p1: 2, p2: 2 });
    expect(publicDoc.drawnCardPlayable).toBe(true);
    expect(publicDoc.topCard!.value).toBe('5');
    expect(handDocs.p1!.drawnCardId).toBeNull();
    expect(JSON.stringify(publicDoc)).not.toContain(hands[1]![0]!.id); // no hidden cards leak
    expect(joinState(publicDoc, handDocs, privateDoc)).toEqual(drawn);
  });

  it('has no turn player once finished', () => {
    const { state, hands } = setup({ hands: [['r1'], ['g1']], flip: 'r5' });
    const done = act(state, { type: 'play', uid: 'p0', cardId: hands[0]![0]!.id });
    const { publicDoc } = splitState(done);
    expect(publicDoc.turnUid).toBeNull();
  });
});

describe('messages', () => {
  it('has a message for every error', () => {
    const errors: EngineError[] = [
      'NOT_YOUR_TURN',
      'WRONG_PHASE',
      'CARD_NOT_IN_HAND',
      'ILLEGAL_CARD',
      'ILLEGAL_WILD_DRAW_FOUR',
      'COLOR_REQUIRED',
      'MUST_PLAY_DRAWN_CARD_OR_PASS',
      'NO_UNO_PENDING',
      'CANNOT_CATCH_SELF',
      'NOT_A_PLAYER',
      'GAME_FINISHED',
    ];
    for (const e of errors) expect(messageFor(e).length).toBeGreaterThan(5);
  });
});
