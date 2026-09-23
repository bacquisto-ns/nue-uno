import type { Card } from '@nue-uno/engine';
import { describe, expect, it } from 'vitest';
import { myOptions, seatsFromMe, sortHand, whyNotPlayable, type TableViewModel } from './view';

const card = (id: string, color: Card['color'], value: Card['value']): Card => ({ id, color, value });

function view(overrides: Partial<TableViewModel> = {}): TableViewModel {
  const seat = (uid: string) => ({ uid, displayName: uid, avatarId: 'fox', avatarColor: 'teal', cardCount: 2, away: false, forfeited: false });
  return {
    myUid: 'me',
    seats: [seat('a'), seat('me'), seat('b')],
    myHand: [card('r1', 'red', '1'), card('g2', 'green', '2'), card('w4', 'wild', 'wild4')],
    topCard: card('r5', 'red', '5'),
    currentColor: 'red',
    direction: 1,
    phase: 'awaiting_play',
    turnUid: 'me',
    drawnCardId: null,
    drawPileCount: 50,
    unoPending: null,
    finalLap: { active: false, remaining: [] },
    turnDeadlineMs: null,
    graceMs: 1500,
    paused: false,
    mode: 'casual',
    status: 'in_progress',
    placements: null,
    endedBy: null,
    version: 3,
    lastPlayedBy: null,
    ...overrides,
  };
}

describe('myOptions', () => {
  it('lists playable cards and respects the Wild Draw 4 rule', () => {
    const o = myOptions(view());
    expect([...o.playable]).toEqual(['r1']);
    expect(o).toMatchObject({ isMyTurn: true, canDraw: true, canPass: false, unoOnPlay: false });
  });

  it('only the drawn card is playable after drawing', () => {
    const o = myOptions(view({ phase: 'awaiting_drawn_decision', drawnCardId: 'g2' }));
    expect([...o.playable]).toEqual([]);
    expect(o.canPass).toBe(true);
    const o2 = myOptions(view({ phase: 'awaiting_drawn_decision', drawnCardId: 'r1' }));
    expect([...o2.playable]).toEqual(['r1']);
  });

  it('offers UNO on the second-to-last card, and catch/call windows', () => {
    const two = view({ myHand: [card('r1', 'red', '1'), card('g2', 'green', '2')] });
    expect(myOptions(two).unoOnPlay).toBe(true);
    expect(myOptions(view({ turnUid: 'a', unoPending: 'a' })).catchable).toEqual(['a']);
    expect(myOptions(view({ turnUid: 'a', unoPending: 'me' })).canCallUno).toBe(true);
  });

  it('does nothing when paused, finished or not my turn', () => {
    expect(myOptions(view({ paused: true })).canDraw).toBe(false);
    expect(myOptions(view({ status: 'finished' })).isMyTurn).toBe(false);
    expect(myOptions(view({ turnUid: 'a' })).playable.size).toBe(0);
  });
});

describe('helpers', () => {
  it('explains why a card is not playable', () => {
    expect(whyNotPlayable(view(), card('w4', 'wild', 'wild4'))).toContain('no red cards');
    expect(whyNotPlayable(view({ turnUid: 'a' }), card('r1', 'red', '1'))).toContain('not your turn');
  });

  it('sorts hands and rotates seats to start with me', () => {
    const sorted = sortHand([card('w', 'wild', 'wild'), card('b9', 'blue', '9'), card('r2', 'red', '2'), card('r0', 'red', '0')]);
    expect(sorted.map((c) => c.id)).toEqual(['r0', 'r2', 'b9', 'w']);
    expect(seatsFromMe(view()).map((s) => s.uid)).toEqual(['me', 'b', 'a']);
  });
});
