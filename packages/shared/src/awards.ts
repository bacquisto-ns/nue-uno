/**
 * Awards (PRD E14, tournament.md §6). Pure: the `computeAwards` admin action gathers the inputs
 * from playerStats, Passports, the Department Cup, Pick'em and the bracket, and stores the result
 * in awards/{seasonId}.
 */

export interface AwardStatsInput {
  uid: string;
  humanGames: number;
  wild4Played: number;
  maxCardsHeldInWin: number;
  catches: number;
  distinctCoworkers: number;
  crossDeptPairs: number;
}

export interface AwardWinner {
  uid: string | null;
  displayName: string;
}

export interface Award {
  key: 'champion' | 'connector' | 'draw4' | 'comeback' | 'sharpshooter' | 'iron' | 'cup' | 'oracle';
  emoji: string;
  title: string;
  blurb: string;
  /** More than one when the award is shared (tied on the stat and on games played). */
  winners: AwardWinner[];
  statLine: string;
}

export interface AwardsInput {
  championUid: string | null;
  players: readonly AwardStatsInput[];
  names: Readonly<Record<string, string>>;
  cupLeader: { department: string; cupScore: number } | null;
  pickem: readonly { uid: string; displayName: string; points: number }[];
  /** Each player award needs at least this many human games (tournament.md §6). */
  minGames?: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Highest `stat` wins. Ties go to fewer games played (a higher rate); if still tied the award is
 * shared. Nobody wins with a stat of 0.
 */
export function pickLeaders<T extends { uid: string; humanGames: number }>(rows: readonly T[], stat: (r: T) => number): T[] {
  let best: T[] = [];
  for (const r of rows) {
    const v = stat(r);
    if (v <= 0) continue;
    const b = best[0];
    if (!b || v > stat(b) || (v === stat(b) && r.humanGames < b.humanGames)) best = [r];
    else if (v === stat(b) && r.humanGames === b.humanGames) best.push(r);
  }
  return [...best].sort((a, b) => a.uid.localeCompare(b.uid));
}

export function computeAwards(input: AwardsInput): Award[] {
  const minGames = input.minGames ?? 3;
  const eligible = input.players.filter((p) => p.humanGames >= minGames);
  const name = (uid: string) => input.names[uid] ?? 'Player';
  const out: Award[] = [];

  function player(key: Award['key'], emoji: string, title: string, blurb: string, stat: (p: AwardStatsInput) => number, line: (v: number) => string, rows = eligible) {
    const leaders = pickLeaders(rows, stat);
    if (!leaders.length) return;
    out.push({ key, emoji, title, blurb, winners: leaders.map((p) => ({ uid: p.uid, displayName: name(p.uid) })), statLine: line(stat(leaders[0]!)) });
  }

  if (input.championUid) {
    out.push({ key: 'champion', emoji: '🏆', title: 'Champion', blurb: 'Won the Connections tournament', winners: [{ uid: input.championUid, displayName: name(input.championUid) }], statLine: 'Bracket winner' });
  }
  // Connector: most distinct coworkers, then most cross-department pairs.
  player('connector', '🤝', 'Connector', 'Played the most coworkers', (p) => p.distinctCoworkers * 1000 + p.crossDeptPairs, (v) => `${plural(Math.floor(v / 1000), 'coworker')} · ${plural(v % 1000, 'other-department opponent')}`);
  player('draw4', '😈', 'Draw-4 Dealer', 'Most Wild Draw 4s played', (p) => p.wild4Played, (v) => `${plural(v, 'Wild Draw 4')} played`);
  player('comeback', '🔄', 'Comeback Kid', 'Won after holding the most cards', (p) => p.maxCardsHeldInWin, (v) => `Won after holding ${plural(v, 'card')}`);
  player('sharpshooter', '🎯', 'Sharpshooter', 'Most UNO catches', (p) => p.catches, (v) => (v === 1 ? '1 UNO catch' : `${v} UNO catches`));
  player('iron', '🦾', 'Iron Player', 'Most games played', (p) => p.humanGames, (v) => `${plural(v, 'game')} played`);

  if (input.cupLeader && input.cupLeader.cupScore > 0) {
    out.push({ key: 'cup', emoji: '🏢', title: 'Department Cup', blurb: 'Top department', winners: [{ uid: null, displayName: input.cupLeader.department }], statLine: `${input.cupLeader.cupScore} Cup points` });
  }
  const top = input.pickem[0];
  if (top && top.points > 0) {
    const tied = input.pickem.filter((e) => e.points === top.points);
    out.push({ key: 'oracle', emoji: '🔮', title: 'Oracle', blurb: "Top Pick'em predictor", winners: tied.map((e) => ({ uid: e.uid, displayName: e.displayName })), statLine: `${top.points} Pick'em points` });
  }
  // The Champion goes last on the TV (it's the finale), so present it at the end.
  const champion = out.findIndex((a) => a.key === 'champion');
  if (champion >= 0) out.push(...out.splice(champion, 1));
  return out;
}
