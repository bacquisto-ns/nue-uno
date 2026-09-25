import { describe, expect, it } from 'vitest';
import { cueFor } from './cues';

const names = (c: ReturnType<typeof cueFor>) => c?.sounds.map((s) => s.name);

describe('cueFor (motion spec §5 sounds and haptics)', () => {
  it('slams a +4 with a crowd "ooh" and buzzes only the victim', () => {
    const c = cueFor({ type: 'card_played', uid: 'a', targetUid: 'b', card: { value: 'wild4' } });
    expect(names(c)).toEqual(['slam', 'crowd-ooh']);
    expect(c).toMatchObject({ haptic: 'heavy', hapticFor: 'b' });
  });

  it('plays one draw per drawn card, capped at four', () => {
    expect(names(cueFor({ type: 'cards_drawn', uid: 'a', count: 2 }))).toEqual(['draw', 'draw']);
    expect(cueFor({ type: 'cards_drawn', uid: 'a', count: 9 })?.sounds).toHaveLength(4);
  });

  it('covers the signature moments and adds a cheer on the TV', () => {
    expect(names(cueFor({ type: 'uno_called', uid: 'a' }))).toEqual(['uno-shout']);
    expect(names(cueFor({ type: 'uno_caught', uid: 'a', targetUid: 'b' }))).toEqual(['siren-short', 'stamp']);
    expect(names(cueFor({ type: 'final_lap' }))).toEqual(['final-lap-horn']);
    expect(names(cueFor({ type: 'game_finished', uid: 'a' }))).toEqual(['win-sting']);
    expect(names(cueFor({ type: 'game_finished', uid: 'a' }, true))).toEqual(['win-sting', 'cheer']);
  });

  it('stays quiet for bookkeeping events', () => {
    expect(cueFor({ type: 'turn_passed', uid: 'a' })).toBeNull();
    expect(cueFor({ type: 'color_chosen', uid: 'a' })).toBeNull();
  });
});
