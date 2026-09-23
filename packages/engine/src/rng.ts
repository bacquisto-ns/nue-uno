/**
 * mulberry32: tiny, fast, deterministic PRNG. The whole generator state is one 32-bit integer,
 * which we persist in GameState.rngState so every game can be replayed from its seed.
 */
export function mulberry32Step(state: number): [value: number, nextState: number] {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** A mutable RNG view over a numeric state; read `.state` back when done. */
export class Rng {
  constructor(public state: number) {}

  next(): number {
    const [value, next] = mulberry32Step(this.state);
    this.state = next;
    return value;
  }

  /** Integer in [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}

/** Convenience for callers (bots, the local practice runner) that want a plain function. */
export function createRandom(seed: number): () => number {
  const rng = new Rng(seed | 0);
  return () => rng.next();
}
