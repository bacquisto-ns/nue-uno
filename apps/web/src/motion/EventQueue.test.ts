import { describe, expect, it, vi } from 'vitest';
import { EventQueue } from './EventQueue';

type Ev = { seq: number; type: string };
const ev = (seq: number, type = 'card_played'): Ev => ({ seq, type });
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(now = () => 0) {
  const played: number[] = [];
  const skipped: number[][] = [];
  const onIdle = vi.fn();
  const q = new EventQueue<Ev>({
    play: async (e) => {
      played.push(e.seq);
    },
    fastForward: (s) => skipped.push(s.map((e) => e.seq)),
    onIdle,
    now,
  });
  return { q, played, skipped, onIdle };
}

describe('EventQueue', () => {
  it('plays events once, in seq order, then goes idle', async () => {
    const { q, played, onIdle } = harness();
    q.push([ev(2), ev(1)]);
    q.push([ev(1), ev(2), ev(3)]);
    await flush();
    expect(played).toEqual([1, 2, 3]);
    expect(onIdle).toHaveBeenCalled();
    expect(q.idle).toBe(true);
  });

  it('skips events claimed by optimistic moves', async () => {
    const { q, played } = harness();
    const mine = (e: Ev) => e.type === 'mine';
    q.claim(mine);
    q.push([ev(1, 'mine'), ev(2)]);
    await flush();
    expect(played).toEqual([2]);
  });

  it('unclaim restores normal playback after a rejected move', async () => {
    const { q, played } = harness();
    const mine = (e: Ev) => e.type === 'mine';
    q.claim(mine);
    q.unclaim(mine);
    q.push([ev(1, 'mine')]);
    await flush();
    expect(played).toEqual([1]);
  });

  it('fast-forwards when the backlog is too long', async () => {
    const { q, played, skipped } = harness();
    q.push([ev(1), ev(2), ev(3), ev(4), ev(5)]);
    await flush();
    expect(played).toEqual([]);
    expect(skipped).toEqual([[1, 2, 3, 4, 5]]);
  });

  it('fast-forwards when events have waited too long', async () => {
    let t = 0;
    const played: number[] = [];
    const skipped: number[][] = [];
    let release: () => void = () => {};
    const q = new EventQueue<Ev>({
      play: (e) => {
        played.push(e.seq);
        return new Promise<void>((r) => (release = r));
      },
      fastForward: (s) => skipped.push(s.map((e) => e.seq)),
      now: () => t,
    });
    q.push([ev(1)]); // starts playing, blocks
    q.push([ev(2)]); // waits at t=0
    t = 2000;
    q.push([ev(3)]); // oldest waited 2s → skip 2 and 3
    expect(skipped).toEqual([[2, 3]]);
    release();
    await flush();
    expect(played).toEqual([1]);
  });
});
