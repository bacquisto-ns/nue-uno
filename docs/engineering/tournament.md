# Tournament: Qualifiers, Seeding, and Bracket

Related: [PRD §4–5](../PRD.md#4-tournament-lifecycle) · [Data model](data-model.md) · [API](api.md)

All numbers here are defaults stored in `seasons/{id}.scoring`. An admin can change them before qualifiers open.

## 1. Qualifiers

### Which games count
A game is **ranked**, and produces a `results` doc, only if all of the following are true when `startGame` runs:
- the host requested Ranked,
- **3 or more** players are seated. Two-player games are always casual, because a 2-player table is too easy to arrange with a friend.
- the time is inside `[qualifierStart, qualifierEnd)` and `season.status == 'qualifying'`,
- the anti-collusion check below passes.

A game that starts inside the window counts even if it finishes after the window closes.

### Placement points
| Table size | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| 4 players | 10 | 6 | 3 | 1 |
| 3 players | 8 | 4 | 1 | — |

Players who forfeit get the points for last place. Placement order is defined in [game-engine.md §Game end](game-engine.md#game-end-and-placements).

### Qualifier score
```
score        = sum of a player's best 10 point totals (bestN = 10) among non-voided ranked results
eligible     = rankedGames >= 3 (minGames)
```
**Leaderboard order:** `score` desc → `winRate` desc → `avgPlace` asc → earliest time the player reached their current score.

Why best 10: it rewards good results without making volume the deciding factor. After about 10 games, extra games help only if they beat your weakest counted game.

**Worked example.** Priya has played 12 ranked games (4 players unless noted):

| Game | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 (3p) | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Place | 1 | 3 | 2 | 4 | 1 | 2 | 3 | 1 | 4 | 2 | 3 | 1 |
| Points | 10 | 3 | 6 | 1 | 10 | 6 | 3 | 8 | 1 | 6 | 3 | 10 |

Best 10 = drop two of the 1-point games → 10+10+10+8+6+6+6+3+3+3 = **65**. Her record is 4 wins in 12 games (winRate 0.333) and she is eligible.

### Anti-collusion
`groupKey` = the sorted UIDs of the seated players, joined with `_`. When a ranked game starts, count that season's non-voided ranked results with the same `groupKey` whose `finishedAt` falls on the same calendar day (company time zone, `America/Chicago`, configurable). If the count is already `maxSameGroupPerDay` (2) or more, the game starts as **casual**. The lobby shows a warning before the host presses Start.

This doesn't stop every form of collusion, but it's enough for a friendly internal event. Admins can also `voidGame` anything suspicious.

## 2. Seeding

At seeding lock (end of the qualifier window):
1. Take the leaderboard entries where `eligible && attendingEvent`, in leaderboard order.
2. Remove anyone the admin excluded.
3. Seeds 1..N go to the top N. By default N = `bracketSize` = 16. If fewer eligible players are attending, N = everyone eligible (minimum 3).
4. The admin reviews the **draft**, can swap seeds or pull in the next eligible player for a no-show, and then **locks** it.

On event morning, if a seeded player is absent, the admin uses `editBracketSeeds` before Round 1 starts (the bracket must still be a draft, so lock it only once attendance is confirmed) or uses `force` start and lets timeouts play for the missing player.

## 3. Bracket format

Tables of 4 (or 3). **The top 2 at each table advance.** When 4 or fewer players remain, they play the **Final table**: 3 games, ranked by total placement points.

### Default: 16 players → 3 rounds

```
Round 1 (4 tables of 4)      Semifinal (2 tables of 4)     Final (1 table, best of 3 games)
 A: 1  8  9 16  ─┐
 B: 2  7 10 15  ─┼──► E: A1 C1 B2 D2 ─┐
 C: 3  6 11 14  ─┤                    ├──► Final: E1 E2 F1 F2
 D: 4  5 12 13  ─┴──► F: B1 D1 A2 C2 ─┘
```

- **Round 1: snake seeding.** Seeds 1–4 go to tables A→D, seeds 5–8 to D→A, 9–12 to A→D, and 13–16 to D→A. Every table's seeds add up to 34, so the tables are balanced.
- **Semifinal: cross-pairing.** Table winners are spread round-robin, and runners-up go to a table **without** their Round-1 table-mate. So no two players from the same Round-1 table meet again until the final.
- **Final:** 3 games with the same 4 players. Each game awards 10/6/3/1. Final standings are by total points, then number of game wins, then placement in game 3. The top finisher is the **Champion**.

**Estimated run time:** about 15 minutes per single-game round with the 30s timer, and about 40 minutes for the final. With check-in and buffer, the total is **about 75–90 minutes**.

### Bracket generation (general N)
```
function generateBracket(seeds[1..N]):
  round = 1; players = seeds
  while len(players) > 4:
      T = ceil(len(players) / 4)
      short = 4*T - len(players)            // number of 3-seat tables (0..3)
      tables = T tables; the first `short` tables (top seeds) get 3 seats, the rest 4
      if round == 1: fill by snake over seed order, skipping full tables
      else:          winners round-robin over tables, then runners-up greedily into
                     the next table that has no Round-(r-1) table-mate and a free seat
      emit matches with slots { source: seed | {matchId, place} }
      players = 2*T placeholders; round++
  emit Final match with the remaining (≤4) placeholders, gamesToPlay = finalGames
```

| N | Rounds (tables) | Notes |
|---|---|---|
| 8 | R1 (2×4) → Final | |
| 10 | R1 (3 tables: 3,3,4) → SF (2×3) → Final | Tables A and B (top seeds) have 3 seats |
| 12 | R1 (3×4) → SF (2×3) → Final | |
| 16 | R1 (4×4) → SF (2×4) → Final | Default |
| 20 | R1 (5×4) → R2 (3,3,4) → SF (2×3) → Final | Adds a round (about +15 min) |

### Advancement mechanics
- A bracket game's `results` doc triggers `advanceBracket(matchId)`. Standings are **recomputed** from all non-voided results of that match, so an admin void or override just triggers another recompute.
- When a match is complete, its `advancing` UIDs are written into the slots of later matches that reference `{ matchId, place }`. A match whose slots are all filled becomes `ready`, and its players see the **Join now** banner.
- **Admin override** (`overrideMatchResult`) writes the standings directly, marks `override`, and advances the bracket the same way.

### Tie handling inside a single-game match
There are no ties for placement: the engine's placement order is total (fewest cards → lowest hand value → seat distance from the winner).
