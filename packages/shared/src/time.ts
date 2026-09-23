/** Offset (ms) of `timeZone` from UTC at instant `ms`, e.g. −5 h for Chicago in summer. */
export function tzOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC ms of local midnight (in `timeZone`) for the calendar day containing `ms`. */
export function startOfDayMs(ms: number, timeZone: string): number {
  const local = ms + tzOffsetMs(ms, timeZone);
  const d = new Date(local);
  const midnightLocal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // Re-evaluate the offset at midnight itself (DST switches happen at 2am, not midnight).
  return midnightLocal - tzOffsetMs(midnightLocal - tzOffsetMs(ms, timeZone), timeZone);
}

export interface UnoHourWindow {
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: readonly number[];
  start: string; // "HH:MM" local to the season time zone
  end: string;
}

export interface UnoHourSlot {
  startMs: number;
  endMs: number;
  live: boolean;
}

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h! * 60 + m!) * 60_000;
};

/** The live Uno Hour, or the next one within 8 days (PRD L5). */
export function nextUnoHour(
  nowMs: number,
  windows: readonly UnoHourWindow[],
  timeZone: string,
): UnoHourSlot | null {
  let best: UnoHourSlot | null = null;
  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const midnight = startOfDayMs(nowMs + dayOffset * 86_400_000, timeZone);
    // ISO weekday of that local date (noon avoids DST edge cases).
    const weekday = new Date(midnight + 12 * 3_600_000 + tzOffsetMs(midnight, timeZone)).getUTCDay() || 7;
    for (const w of windows) {
      if (!w.days.includes(weekday)) continue;
      const startMs = midnight + hm(w.start);
      const endMs = midnight + hm(w.end);
      if (endMs <= nowMs) continue;
      const slot = { startMs, endMs, live: startMs <= nowMs };
      if (!best || slot.startMs < best.startMs) best = slot;
    }
    if (best) return best;
  }
  return best;
}
