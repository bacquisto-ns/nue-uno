# Tournament: Qualifiers, Seeding, Bracket, and Side Competitions

Related: [PRD v2 §4–7](../PRD.md#4-tournament-lifecycle-and-timeline) · [Data model](data-model.md) · [API](api.md) · [Game engine](game-engine.md)

All numbers below are defaults stored in `seasons/{id}`. An admin can change them before qualifiers open.

## 1. Qualifiers

### Which games are ranked
A game starts as **ranked** only if all of these are true when `startGame` runs:
- the host asked for Ranked,
- **3 or more** humans are seated (2-player games are always casual),
- the time is inside `[qualifierStart, qualifierEnd)` and the season status is `qualifying`,
- the same group of players hasn't already played `maxSameGroupPerDay` (2) ranked games together today (see anti-collusion below).

A game that starts inside the window counts even if it finishes after the window closes. Practice games against bots never count.

### Which results count
Every human game writes a `results` doc, which is used for the Passport and stats. Within a **ranked** result, each placement entry has a `counts` flag:

| Situation | `counts` |
|---|---|
| The game reached **12 or more turns** (`minTurnsForPoints`) | `true` for everyone |
| The game ended before 12 turns, player **did not** forfeit | `false`: no points for anyone who stayed |
| The game ended before 12 turns, player **forfeited** | `true`, with last-place points, so quitting can't be used to escape a bad result |

This stops friends from quitting early to hand someone a win (v1 review finding #14).

### Placement points
| Table size | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| 4 players | 10 | 6 | 3 | 1 |
| 3 players | 8 | 4 | 1 | — |

Placement order follows [game-engine.md §Game end](game-engine.md#game-end-and-placements). It works the same whether the game ended by an empty hand, the Final Lap, or everyone else leaving. Players who forfeit get last-place points.

### Qualifier score
```
score     = sum of the best 10 (bestN) point totals among the player's counting, non-voided ranked entries
eligible  = number of counting ranked entries >= 3 (minGames)
```
**Leaderboard order:** `score` desc → `winRate` desc → `avgPlace` asc → `scoreReachedAt` asc (whoever reached the score first ranks higher).

**Worked example.** Priya has 12 counting ranked games (4 players unless noted):

| Game | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 (3p) | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Place | 1 | 3 | 2 | 4 | 1 | 2 | 3 | 1 | 4 | 2 | 3 | 1 |
| Points | 10 | 3 | 6 | 1 | 10 | 6 | 3 | 8 | 1 | 6 | 3 | 10 |

Best 10 drops the two 1-point games: 10+10+10+8+6+6+6+3+3+3 = **65**. She has 4 wins (winRate 0.333) and is eligible.

### Anti-collusion
`groupKey` = the sorted UIDs joined with `_`. When `joinTable` or `startGame` runs, count that season's non-voided ranked results with the same `groupKey` from today (in `season.timezone`). If the count is 2 or more, the lobby shows `collusionWarning` and the game starts as **casual**. Admins can also void anything that looks suspicious.

### Uno Hours
These are scheduled windows (default weekdays 12:00–12:45 and 16:00–16:30 Central) when players are encouraged to be online at the same time. They're a way to get people online together, not a scoring rule: games count the same inside and outside Uno Hours. The lobby shows a countdown, and `unoHourAnnouncer` posts to Teams and shows a banner when one starts.

## 2. Seeding and the Selection Show

At seeding lock (end of the qualifier window):
1. Take the leaderboard entries where `eligible` is true and `attendingEvent == 'yes'`, in leaderboard order.
2. Remove anyone the admin has excluded.
3. Seeds 1..N go to the top N (default 16). If fewer players qualify, N = all eligible attendees, with a minimum of 3.
4. The draft stays **private** (visible to admins only) until the Selection Show. The public leaderboard still shows who is above the Top 16 cut line. With the blackout (P2), the top 20 are hidden for the final 24 hours.

**Event morning:** admins confirm who is actually present, replace no-shows with the next eligible player (`editBracketSeeds`), and **lock** the bracket.

**Selection Show order:** seeds are revealed from 16 down to 1. Each reveal shows the seed, player, qualifier record, and assigned table, and sends that player a "You're in!" takeover on their phone. The top 4 reveals get extra suspense. Last, the full bracket assembles on screen.

## 3. Bracket format

Tables of 4 (or 3). **The top 2 at each table advance.** When 4 or fewer players remain, they play the **Final**: 3 games, ranked by total placement points.

**Bracket timers:** 20s turns plus 1.5s of grace. **The Final Lap starts at 12 minutes**, so each game lasts at most about 12 min plus one more lap (roughly 1–2 minutes). See [PRD §7](../PRD.md#7-event-run-of-show-default-16-player-bracket-2-hour-block) for the run-of-show.

### Default: 16 players, 3 rounds

```
Round 1 (4 tables of 4)      Semifinal (2 tables of 4)     Final (1 table, 3 games)
 A: 1  8  9 16  ─┐
 B: 2  7 10 15  ─┼──► E: A1 C1 B2 D2 ─┐
 C: 3  6 11 14  ─┤                    ├──► Final: E1 E2 F1 F2
 D: 4  5 12 13  ─┴──► F: B1 D1 A2 C2 ─┘
```

- **Round 1 uses snake seeding.** Seeds 1–4 go A→D, seeds 5–8 go D→A, and so on. Every table's seeds add up to 34.
- **The Semifinal splits up Round 1 tables.** Table winners are spread round-robin. Runners-up go to a table that doesn't have their Round-1 table-mate.
- **Final:** 3 games, each awarding 10/6/3/1. Ranked by total points, then game wins, then placement in game 3.
- **Default physical tables:** Round 1 A–D → tables 1–4. Semifinal E, F → tables 1, 2. Final → table 1 (the "main stage", next to the TV).

**Worst-case timing:** Round 1 about 14 min, Semifinal about 14 min, Final about 3 × 14 = 42 min. That's about 70 min of play, plus the Selection Show, breaks, and awards, for about 100 minutes in total.

### Bracket generation (general N)
```
function generateBracket(seeds[1..N]):
  round = 1; players = seeds
  while len(players) > 4:
      T = ceil(len(players) / 4)
      short = 4*T - len(players)            // number of 3-seat tables (0..3)
      the first `short` tables (top seeds) get 3 seats; the rest get 4
      if round == 1: fill by snake over seed order, skipping full tables
      else:          winners round-robin over the tables, then runners-up greedily into the
                     next table that has a free seat and no Round-(r-1) table-mate
      emit matches with slots { source: seed | {matchId, place} }
      players = 2*T placeholders; round++
  emit the Final with the remaining (≤4) placeholders, gamesToPlay = finalGames
```

| N | Rounds (tables) | Notes |
|---|---|---|
| 8 | R1 (2×4) → Final | |
| 10 | R1 (3,3,4) → SF (2×3) → Final | The top seeds get the 3-seat tables |
| 12 | R1 (3×4) → SF (2×3) → Final | |
| 16 | R1 (4×4) → SF (2×4) → Final | Default |
| 20 | R1 (5×4) → R2 (3,3,4) → SF (2×3) → Final | Adds about 15 minutes |

### Advancement
- Every bracket game result calls `advanceBracket(matchId)`, which **recomputes** standings from the match's non-voided results. Voids and admin overrides simply trigger another recompute.
- When a match completes, its `advancing` players fill the slots in later matches. When all slots in a match are filled, it becomes `ready`: its players get a takeover on their phones, and the TV shows a match callout.
- There are no ties within a single game, because the engine's placement order always separates players.

## 4. Pick'em

- **Who:** any active player, including bracket players (they can pick themselves).
- **What:**
  - (a) a **champion** pick, locked when Round 1's first game starts
  - (b) a **winner for each table**, each locked when that table's game starts. For the Final, the pick is the overall winner of the Final.
- **Scoring:** 3 points for each correct table winner and 10 points for the correct champion.
  - Round 1 picks can be made before the Selection Show ends. Later-round picks open as soon as that match's players are known.
- **Leaderboard order:** points desc → number of correct picks desc → earliest champion pick.
- **Computed** by `onMatchWritten` whenever a match completes, from `picks` and match `advancing[0]`.

## 5. Department Cup

```
cupScore(dept) = sum of the top 3 (topN) qualifier scores among the department's members
               + 2 (participationBonus) × number of members with ≥ 3 (participationMinGames) counting ranked games
```
**Example:** Finance's top three scores are 72, 65, and 40 (177 total), and 5 members have played 3 or more counting games (+10). Cup score = **187**.

- Remote employees count. Seeding isn't involved.
- Departments come from the roster (or the profile picker), and admins can fix them.
- Ties are broken by the higher total participation bonus, then the best single score.
- The Cup is recomputed by `onLeaderboardEntryWritten`, so voids are reflected automatically.

## 6. Awards

`computeAwards` runs after the Final. Each award requires at least 3 human games. Ties are broken by the fewest games played (a higher rate wins), and if still tied, the award is shared.

| Award | Rule | Data |
|---|---|---|
| 🏆 **Champion** | Bracket winner | `brackets.championUid` |
| 🤝 **Connector** | Most distinct coworkers played, then most cross-department pairs | `passport` |
| 😈 **Draw-4 Dealer** | Most Wild Draw 4s played | `playerStats.wild4Played` |
| 🔄 **Comeback Kid** | Largest peak hand size in a game they went on to win | `playerStats.maxCardsHeldInWin` (the winner's `stats.maxHandSize` per result) |
| 🎯 **Sharpshooter** | Most successful UNO catches | `playerStats.catches` |
| 🦾 **Iron Player** | Most human games played | `playerStats.humanGames` |
| 🏢 **Department Cup** | Top `cupScore` | `departmentCup` |
| 🔮 **Oracle** (Pick'em) | Top Pick'em score | `pickem` |

## 7. Connection Passport

- A **stamp** for each distinct coworker played in any human game (casual, ranked, or bracket). Bots never count.
- Each opponent's department is recorded, which gives **department stamps**.
- `crossDeptPairs` = distinct opponents from a department other than the player's own.
- **Milestones:** 5, 10, and 20 coworkers, all departments, and finishing the tutorial. Each milestone gets an animated stamp in the results screen and profile. Milestones can unlock cosmetics (P2).
- The Passport is recomputed from `results` by `onResultWritten`, so voided games drop out.
- It feeds these success metrics: average distinct coworkers per player (target ≥ 6) and cross-department share of pairings (target ≥ 50%).
