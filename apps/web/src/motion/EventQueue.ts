import { limits } from './tokens';

export interface QueuedEvent {
  seq: number;
}

export interface EventQueueOptions<E extends QueuedEvent> {
  /** Animate one event; resolve when its choreography is done. */
  play: (event: E) => Promise<void>;
  /** Jump straight to the latest state; `skipped` were never animated. */
  fastForward: (skipped: E[]) => void;
  /** Called whenever the queue drains (the turn timer starts only then — ADR-4). */
  onIdle?: () => void;
  maxBacklog?: number;
  maxLagMs?: number;
  now?: () => number;
}

/**
 * Per-table animation queue (motion spec §4):
 *  1. events play in `seq` order, each exactly once;
 *  2. optimistic local moves claim their server event so it isn't animated twice;
 *  3. if we fall more than `maxBacklog` events or `maxLagMs` behind, fast-forward.
 */
export class EventQueue<E extends QueuedEvent> {
  private queue: { event: E; enqueuedAt: number }[] = [];
  private lastSeq = -Infinity;
  private playing = false;
  private claims: ((e: E) => boolean)[] = [];
  private readonly opts: Required<Omit<EventQueueOptions<E>, 'onIdle'>> &
    Pick<EventQueueOptions<E>, 'onIdle'>;

  constructor(opts: EventQueueOptions<E>) {
    this.opts = {
      maxBacklog: limits.queueMaxBacklog,
      maxLagMs: limits.queueMaxLagMs,
      now: () => performance.now(),
      ...opts,
    };
  }

  /** Swap playback callbacks (e.g. when the effects mode changes) without losing queue state. */
  configure(opts: Partial<Pick<EventQueueOptions<E>, 'play' | 'fastForward' | 'onIdle'>>): void {
    Object.assign(this.opts, opts);
  }

  get idle(): boolean {
    return !this.playing && this.queue.length === 0;
  }

  /** Mark the next matching server event as already animated (optimistic move). */
  claim(predicate: (e: E) => boolean): void {
    this.claims.push(predicate);
  }

  /** Drop a claim, e.g. when the server rejected the optimistic move. */
  unclaim(predicate: (e: E) => boolean): void {
    this.claims = this.claims.filter((p) => p !== predicate);
  }

  push(events: readonly E[]): void {
    const now = this.opts.now();
    for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
      if (event.seq <= this.lastSeq) continue;
      this.lastSeq = event.seq;
      const claimIdx = this.claims.findIndex((p) => p(event));
      if (claimIdx >= 0) {
        this.claims.splice(claimIdx, 1);
        continue;
      }
      this.queue.push({ event, enqueuedAt: now });
    }
    if (this.isBehind(now)) {
      const skipped = this.queue.map((q) => q.event);
      this.queue = [];
      this.opts.fastForward(skipped);
    }
    void this.drain();
  }

  private isBehind(now: number): boolean {
    const oldest = this.queue[0];
    return (
      this.queue.length > this.opts.maxBacklog ||
      (oldest !== undefined && now - oldest.enqueuedAt > this.opts.maxLagMs)
    );
  }

  private async drain(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length) {
        const next = this.queue.shift()!;
        await this.opts.play(next.event);
      }
    } finally {
      this.playing = false;
    }
    this.opts.onIdle?.();
  }
}
