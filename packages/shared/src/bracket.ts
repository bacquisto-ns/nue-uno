/**
 * Event-day bracket (docs/engineering/tournament.md §3–4). Pure functions: the functions layer
 * persists what these return and recomputes from source whenever results change.
 */

export type SlotSource = { seed: number } | { matchId: string; place: number };

export interface MatchPlan {
  matchId: string;
  round: number;
  /** Table letter (A, B, …) — continues across rounds, like the doc's R1 A–D → SF E–F. */
  table: string;
  slots: SlotSource[];
  gamesToPlay: number;
  /** Default printed table sign: tables numbered from 1 within each round; the Final at 1. */
  physicalTable: number;
}

export interface RoundPlan {
  number: number;
  name: string;
  matchIds: string[];
}

export interface BracketPlan {
  rounds: RoundPlan[];
  matches: MatchPlan[];
}

const letter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');

/**
 * Table sizes for `players` people: ceil(n/4) tables sized as evenly as possible, with the smaller
 * tables going to the top seeds (tournament.md §3). Only 5 players produces a 2-seat table.
 */
export function tableSizes(players: number): number[] {
  const tables = Math.ceil(players / 4);
  const base = Math.floor(players / tables);
  const bigger = players % tables;
  return Array.from({ length: tables }, (_, i) => (i >= tables - bigger ? base + 1 : base));
}

export function generateBracket(size: number, finalGames = 3): BracketPlan {
  if (!Number.isInteger(size) || size < 3) throw new Error('A bracket needs at least 3 players');
  const rounds: RoundPlan[] = [];
  const matches: MatchPlan[] = [];
  let tableIndex = 0;

  // Sources feeding the current round, best first.
  let feeders: SlotSource[] = Array.from({ length: size }, (_, i) => ({ seed: i + 1 }));
  let round = 1;

  // Work out how many non-final rounds there will be so we can name the last one "Semifinal".
  let count = size;
  let preFinalRounds = 0;
  while (count > 4) {
    count = Math.ceil(count / 4) * 2;
    preFinalRounds++;
  }

  while (feeders.length > 4) {
    const caps = tableSizes(feeders.length);
    const seats: SlotSource[][] = caps.map(() => []);
    const isSemi = round === preFinalRounds;
    const prefix = isSemi ? 'SF' : `R${round}`;

    if (round === 1) {
      // Snake seeding over the seed order, skipping full tables.
      let i = 0;
      let forward = true;
      while (i < feeders.length) {
        const order = caps.map((_, t) => t);
        if (!forward) order.reverse();
        for (const t of order) {
          if (i >= feeders.length) break;
          if (seats[t]!.length < caps[t]!) seats[t]!.push(feeders[i++]!);
        }
        forward = !forward;
      }
    } else {
      // Winners round-robin; runners-up into the first table without their previous table-mate.
      const origin = (s: SlotSource) => ('matchId' in s ? s.matchId : '');
      const winners = feeders.filter((s) => 'place' in s && s.place === 1);
      const runners = feeders.filter((s) => 'place' in s && s.place === 2);
      winners.forEach((w, i) => seats[i % caps.length]!.push(w));
      const fits = (t: number) => seats[t]!.length < caps[t]!;
      const clash = (t: number, r: SlotSource) => seats[t]!.some((s) => origin(s) === origin(r));
      // Tables are tiny, so a backtracking search finds a clean split whenever one exists
      // (greedy placement can paint itself into a corner, e.g. 20 players).
      const place = (i: number): boolean => {
        if (i === runners.length) return true;
        for (let t = 0; t < caps.length; t++) {
          if (!fits(t) || clash(t, runners[i]!)) continue;
          seats[t]!.push(runners[i]!);
          if (place(i + 1)) return true;
          seats[t]!.pop();
        }
        return false;
      };
      if (!place(0)) {
        for (const r of runners) {
          const clean = caps.findIndex((_, t) => fits(t) && !clash(t, r));
          seats[clean >= 0 ? clean : caps.findIndex((_, t) => fits(t))]!.push(r);
        }
      }
    }

    const ids: string[] = [];
    seats.forEach((slots, t) => {
      const table = letter(tableIndex++);
      const matchId = `${prefix}-${table}`;
      ids.push(matchId);
      // A 2-seat table sends both players through, so there is nothing to play.
      matches.push({ matchId, round, table, slots, gamesToPlay: slots.length <= 2 ? 0 : 1, physicalTable: t + 1 });
    });
    rounds.push({ number: round, name: isSemi ? 'Semifinal' : `Round ${round}`, matchIds: ids });

    feeders = [
      ...ids.map((matchId) => ({ matchId, place: 1 })),
      ...ids.map((matchId) => ({ matchId, place: 2 })),
    ];
    round++;
  }

  matches.push({
    matchId: 'FINAL',
    round,
    table: letter(tableIndex),
    slots: feeders,
    gamesToPlay: finalGames,
    physicalTable: 1,
  });
  rounds.push({ number: round, name: 'Final', matchIds: ['FINAL'] });
  return { rounds, matches };
}

// ---- Match standings ------------------------------------------------------------------------

export interface MatchGameResult {
  placements: { uid: string; place: number; points: number }[];
  finishedAtMs: number;
}

export interface MatchStanding {
  uid: string;
  points: number;
  wins: number;
  lastPlace: number;
}

export interface MatchOutcome {
  standings: MatchStanding[];
  complete: boolean;
  /** Top 2 advance; the Final's first is the Champion. */
  advancing: string[];
}

/**
 * Standings from a match's non-voided games. Single-game matches rank by that game's placement;
 * the Final ranks by total points → wins → placement in the last game (tournament.md §3).
 * An admin override (placement order) wins over games.
 */
export function matchOutcome(
  slotUids: readonly string[],
  games: readonly MatchGameResult[],
  gamesToPlay: number,
  isFinal: boolean,
  override?: readonly string[] | null,
): MatchOutcome {
  if (override && override.length) {
    const standings = override.map((uid, i) => ({ uid, points: 0, wins: i === 0 ? 1 : 0, lastPlace: i + 1 }));
    return { standings, complete: true, advancing: override.slice(0, isFinal ? 1 : 2) };
  }
  const chrono = [...games].sort((a, b) => a.finishedAtMs - b.finishedAtMs);
  const last = chrono.at(-1);
  const standings: MatchStanding[] = slotUids.map((uid) => {
    let points = 0;
    let wins = 0;
    for (const g of chrono) {
      const p = g.placements.find((x) => x.uid === uid);
      if (!p) continue;
      points += p.points;
      if (p.place === 1) wins++;
    }
    const lastPlace = last?.placements.find((x) => x.uid === uid)?.place ?? slotUids.length;
    return { uid, points, wins, lastPlace };
  });
  standings.sort((a, b) => b.points - a.points || b.wins - a.wins || a.lastPlace - b.lastPlace);
  // gamesToPlay 0 = automatic advance (2-seat table): keep seed order.
  if (gamesToPlay === 0) standings.sort((a, b) => slotUids.indexOf(a.uid) - slotUids.indexOf(b.uid));
  const complete = chrono.length >= gamesToPlay;
  return { standings, complete, advancing: complete ? standings.slice(0, isFinal ? 1 : 2).map((s) => s.uid) : [] };
}

/** Fill every match's slots from seeds and completed feeder matches. `null` = not known yet. */
export function resolveSlots(
  plan: BracketPlan,
  seedUids: readonly string[],
  advancing: Readonly<Record<string, readonly string[]>>,
): Record<string, (string | null)[]> {
  const out: Record<string, (string | null)[]> = {};
  for (const m of plan.matches) {
    out[m.matchId] = m.slots.map((s) =>
      'seed' in s ? (seedUids[s.seed - 1] ?? null) : (advancing[s.matchId]?.[s.place - 1] ?? null),
    );
  }
  return out;
}

// ---- Pick'em --------------------------------------------------------------------------------

export interface Picks {
  champion?: string | null;
  tables?: Record<string, string>;
}

export interface PickemScore {
  points: number;
  correct: number;
  champion: boolean;
}

/** 3 per correct table winner, 10 for the champion (tournament.md §4). */
export function pickemScore(
  picks: Picks,
  winners: Readonly<Record<string, string | undefined>>,
  championUid: string | null,
  settings = { tableWinnerPts: 3, championPts: 10 },
): PickemScore {
  let correct = 0;
  for (const [matchId, uid] of Object.entries(picks.tables ?? {})) {
    if (winners[matchId] && winners[matchId] === uid) correct++;
  }
  const champion = !!championUid && picks.champion === championUid;
  return {
    points: correct * settings.tableWinnerPts + (champion ? settings.championPts : 0),
    correct,
    champion,
  };
}
