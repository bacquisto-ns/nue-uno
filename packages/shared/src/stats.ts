/**
 * Admin Stats (PRD AD10, §13 success metrics). Pure aggregation over plain rows; the `adminStats`
 * admin action reads Firestore/RTDB and passes them in.
 */

export interface StatsUser {
  uid: string;
  status: string;
  attendingEvent: string | null;
  createdAtMs: number | null;
  firstGameAtMs: number | null;
}

export interface StatsResult {
  mode: 'casual' | 'ranked' | 'bracket';
  voided: boolean;
  playerUids: readonly string[];
  finishedAtMs: number;
}

export interface StatsInput {
  users: readonly StatsUser[];
  rosterSize: number;
  results: readonly StatsResult[];
  passports: readonly { uid: string; distinctCoworkers: number; crossDeptPairs: number }[];
  pickemUids: readonly string[];
  reactionUids: readonly string[];
  adminOverrides: number;
  timeZone: string;
}

export interface Metric {
  key: string;
  label: string;
  value: string;
  target: string;
  /** null = no target to judge against, or no data yet. */
  ok: boolean | null;
}

export interface SeasonStats {
  metrics: Metric[];
  /** yyyy-mm-dd (season time zone) → counts, oldest first. */
  daily: { day: string; rankedGames: number; activePlayers: number }[];
}

const pct = (n: number, d: number) => (d > 0 ? n / d : null);
const fmtPct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function dayKey(ms: number, timeZone: string): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

export function seasonStats(input: StatsInput): SeasonStats {
  const registered = input.users.filter((u) => u.status === 'active');
  const registeredIds = new Set(registered.map((u) => u.uid));
  const counted = input.results.filter((r) => !r.voided);
  const ranked = counted.filter((r) => r.mode === 'ranked');
  const rankedPlayers = new Set(ranked.flatMap((r) => r.playerUids).filter((u) => registeredIds.has(u)));

  const played = input.passports.filter((p) => p.distinctCoworkers > 0);
  const avgCoworkers = played.length ? played.reduce((s, p) => s + p.distinctCoworkers, 0) / played.length : null;
  const pairTotal = played.reduce((s, p) => s + p.distinctCoworkers, 0);
  const crossShare = pct(
    played.reduce((s, p) => s + p.crossDeptPairs, 0),
    pairTotal,
  );

  const toFirst = registered
    .filter((u) => u.createdAtMs !== null && u.firstGameAtMs !== null && u.firstGameAtMs >= u.createdAtMs)
    .map((u) => (u.firstGameAtMs! - u.createdAtMs!) / 60_000);
  const medianMin = median(toFirst);

  const attendees = registered.filter((u) => u.attendingEvent === 'yes').map((u) => u.uid);
  const engaged = new Set([...input.pickemUids, ...input.reactionUids]);
  const attendeeShare = pct(attendees.filter((u) => engaged.has(u)).length, attendees.length);

  const regShare = pct(registered.length, input.rosterSize);
  const rankedShare = pct(rankedPlayers.size, registered.length);

  const metrics: Metric[] = [
    { key: 'registered', label: 'Registered / roster', value: input.rosterSize ? `${registered.length} / ${input.rosterSize} (${fmtPct(regShare)})` : `${registered.length} registered (no roster)`, target: '≥ 70%', ok: regShare === null ? null : regShare >= 0.7 },
    { key: 'rankedPlayers', label: 'Players with a ranked game', value: `${rankedPlayers.size} (${fmtPct(rankedShare)} of registered)`, target: '≥ 60%', ok: rankedShare === null ? null : rankedShare >= 0.6 },
    { key: 'rankedGames', label: 'Ranked games', value: String(ranked.length), target: '≥ 150', ok: ranked.length >= 150 },
    { key: 'coworkers', label: 'Avg distinct coworkers played', value: avgCoworkers === null ? '—' : avgCoworkers.toFixed(1), target: '≥ 6', ok: avgCoworkers === null ? null : avgCoworkers >= 6 },
    { key: 'crossDept', label: 'Cross-department pairings', value: fmtPct(crossShare), target: '≥ 50%', ok: crossShare === null ? null : crossShare >= 0.5 },
    { key: 'timeToFirst', label: 'Median sign-in → first game', value: medianMin === null ? '—' : medianMin < 60 ? `${medianMin.toFixed(1)} min` : `${(medianMin / 60).toFixed(1)} h`, target: '< 3 min', ok: medianMin === null ? null : medianMin < 3 },
    { key: 'attendeeEngagement', label: "Attendees using Pick'em or reactions", value: `${fmtPct(attendeeShare)} of ${attendees.length}`, target: '≥ 60%', ok: attendeeShare === null ? null : attendeeShare >= 0.6 },
    { key: 'overrides', label: 'Manual admin overrides', value: String(input.adminOverrides), target: '≤ 2', ok: input.adminOverrides <= 2 },
  ];

  const days = new Map<string, { ranked: number; players: Set<string> }>();
  for (const r of counted) {
    if (!r.finishedAtMs) continue;
    const k = dayKey(r.finishedAtMs, input.timeZone);
    const d = days.get(k) ?? { ranked: 0, players: new Set<string>() };
    if (r.mode === 'ranked') d.ranked++;
    r.playerUids.forEach((u) => d.players.add(u));
    days.set(k, d);
  }
  const daily = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, rankedGames: d.ranked, activePlayers: d.players.size }));

  return { metrics, daily };
}
