# Data Model (Cloud Firestore)

Related: [Architecture](architecture.md) · [API](api.md) · [Game engine](game-engine.md) · [Tournament](tournament.md)

**Conventions**
- Timestamps are Firestore `Timestamp`, written with `FieldValue.serverTimestamp()` or server `Timestamp.now()`.
- The server (Admin SDK in Cloud Functions) writes **every** document. Clients only read. See [Security rules](#security-rules).
- IDs: `uid` is the Firebase Auth UID. Other IDs are Firestore auto-IDs unless noted.
- Engine types (`Card`, `Color`, `Phase`, …) are defined in [game-engine.md](game-engine.md#2-types).

## Collection map

```
config/app                                 # { currentSeasonId }
users/{uid}
seasons/{seasonId}                         # one season for this event: "connections-2026"
games/{gameId}                             # public game state (lobby → finished)
games/{gameId}/hands/{uid}                 # a player's private hand
games/{gameId}/private/state               # draw pile, RNG, dedupe log (server only)
games/{gameId}/events/{seq}                # append-only public move log
results/{gameId}                           # final placements + points (ranked & bracket games)
leaderboard/{seasonId}/entries/{uid}       # denormalized qualifier standings
brackets/{bracketId}                       # bracket config + status
brackets/{bracketId}/matches/{matchId}     # one table in one round
auditLog/{autoId}                          # admin actions
```

---

## `users/{uid}`

| Field | Type | Notes |
|---|---|---|
| `email` | string | From the auth token, always lowercase |
| `displayName` | string | 2–24 characters, trimmed, unique among users (case-insensitive) |
| `avatarId` | string | One of the preset avatar keys, e.g. `"fox"` |
| `attendingEvent` | boolean | Player-controlled. Admins can override it. |
| `isAdmin` | boolean | Mirror of the custom claim, for display only (not used for authorization) |
| `createdAt`, `updatedAt` | Timestamp | |
| `lastSeenAt` | Timestamp | Updated by any callable the user makes |
| `activeGameId` | string \| null | The game the player is seated in. It routes them back after a reload, and it stops a player sitting at two tables at once. |

## `seasons/{seasonId}`

| Field | Type | Notes |
|---|---|---|
| `name` | string | "Connections 2026" |
| `status` | `"setup" \| "qualifying" \| "locked" \| "event" \| "complete"` | Set by an admin |
| `qualifierStart`, `qualifierEnd` | Timestamp | Ranked games can **start** only inside this window |
| `scoring` | map | `{ pointsByTableSize: { "3": [8,4,1], "4": [10,6,3,1] }, bestN: 10, minGames: 3, maxSameGroupPerDay: 2 }` |
| `bracketSize` | number | Default 16 |
| `activeBracketId` | string \| null | |

The web app reads `config/app.currentSeasonId`. It's a one-field doc, so the season can be switched without a deploy.

## `games/{gameId}` — public state

| Field | Type | Notes |
|---|---|---|
| `seasonId` | string | |
| `status` | `"lobby" \| "in_progress" \| "finished" \| "abandoned" \| "voided"` | |
| `mode` | `"casual" \| "ranked" \| "bracket"` | Final at start. Lobby shows the *requested* mode. |
| `requestedMode` | `"casual" \| "ranked"` | Chosen by the host in the lobby |
| `hostUid` | string | |
| `bracketId`, `matchId`, `matchGameNumber` | string / number \| null | Set for bracket games only |
| `seats` | array of `{ uid, displayName, avatarId }` | Seat order = turn order when `direction = 1`. Max 4. |
| `maxSeats` | number | 2–4 |
| `handCounts` | map `uid → number` | |
| `topCard` | `Card` \| null | |
| `currentColor` | `Color` \| null | Differs from `topCard.color` after a wild |
| `direction` | `1 \| -1` | |
| `turnUid` | string \| null | |
| `phase` | `Phase` | `awaiting_play`, `awaiting_color`, `awaiting_drawn_decision`, `finished` |
| `drawnCardPlayable` | boolean | True during `awaiting_drawn_decision` when the drawn card can be played. The card itself is only in the player's hand doc. |
| `unoPending` | string \| null | UID of a player at 1 card who hasn't called UNO. Opponents can catch them while this is set. |
| `away` | map `uid → boolean` | Players marked Away after 3 timeouts in a row |
| `forfeited` | string[] | UIDs that left mid-game |
| `drawPileCount` | number | For display |
| `turnDeadline` | Timestamp \| null | |
| `version` | number | Goes up by 1 on every state change. Clients send it back as `expectedVersion`. |
| `lastEventSeq` | number | |
| `placements` | string[] \| null | UIDs in finishing order, once finished |
| `createdAt`, `startedAt`, `finishedAt`, `updatedAt` | Timestamp | |

## `games/{gameId}/hands/{uid}`

| Field | Type | Notes |
|---|---|---|
| `cards` | `Card[]` | Sorted by color then value, for display |
| `drawnCardId` | string \| null | Set during `awaiting_drawn_decision` |
| `version` | number | Matches the game's `version` when the hand was last written |

## `games/{gameId}/private/state` — server only

| Field | Type | Notes |
|---|---|---|
| `drawPile` | `Card[]` | Last element = top of the pile |
| `discardPile` | `Card[]` | Last element = the visible top card |
| `rngState` | number | Seeded PRNG state (mulberry32), used for reshuffles |
| `seed` | number | The initial seed, for replaying the game |
| `consecutiveTimeouts` | map `uid → number` | |
| `recentMoveIds` | map `clientMoveId → version` | Last 50 moves, used to deduplicate (see [API §Idempotency](api.md#idempotency)) |

The engine's full `GameState` is rebuilt as public doc + all hands + private state. Every transaction writes all three back.

## `games/{gameId}/events/{seq}`

`seq` is a zero-padded integer (`"000042"`), so documents sort in order. Events are public and never include a card that someone other than the viewer shouldn't see. Draws record only a count.

| Field | Type | Example |
|---|---|---|
| `type` | string | `game_started`, `card_played`, `cards_drawn`, `turn_passed`, `color_chosen`, `uno_called`, `uno_caught`, `timeout`, `player_forfeited`, `deck_reshuffled`, `game_finished` |
| `uid` | string \| null | The player who acted |
| `card` | `Card` \| null | For `card_played` |
| `count` | number \| null | For `cards_drawn` |
| `targetUid` | string \| null | Victim of draw2, wild4, or a catch |
| `color` | `Color` \| null | |
| `at` | Timestamp | |

The client uses events to drive animations and a short "last actions" feed. Replaying the game for audit uses `seed` plus the ordered actions.

## `results/{gameId}`

Written in the same transaction that finishes a **ranked** or **bracket** game. Casual games don't get a result.

| Field | Type | Notes |
|---|---|---|
| `seasonId`, `mode`, `bracketId?`, `matchId?` | | |
| `tableSize` | number | Players seated at start (forfeiters included) |
| `placements` | array of `{ uid, place, points, cardsLeft, handValue, forfeited }` | `points` from the season scoring table (bracket games use it too, for the final) |
| `playerUids` | string[] | For `array-contains` queries |
| `groupKey` | string | Sorted UIDs joined with `_`, for the anti-collusion check |
| `finishedAt` | Timestamp | |
| `voided` | boolean | Set by admin `voidGame`. Voided results are ignored everywhere. |

## `leaderboard/{seasonId}/entries/{uid}`

Recomputed by the `onResultWritten` trigger for every player in the result. See [tournament.md](tournament.md#qualifier-score).

| Field | Type | Notes |
|---|---|---|
| `displayName`, `avatarId` | | Denormalized copies |
| `score` | number | Sum of the best `bestN` point totals |
| `rankedGames` | number | Non-voided ranked results |
| `wins` | number | |
| `winRate` | number | wins / rankedGames |
| `avgPlace` | number | |
| `countedGameIds` | string[] | The best-N games that make up the score |
| `eligible` | boolean | `rankedGames >= minGames` |
| `attendingEvent` | boolean | Denormalized from `users` |
| `updatedAt` | Timestamp | |

The client sorts by `score desc, winRate desc, avgPlace asc`. The composite index is listed below.

## `brackets/{bracketId}`

| Field | Type | Notes |
|---|---|---|
| `seasonId` | string | |
| `status` | `"draft" \| "locked" \| "in_progress" \| "complete"` | |
| `size` | number | Players seeded |
| `seeds` | array of `{ seed, uid, displayName, score }` | |
| `rounds` | array of `{ number, name, matchIds[] }` | e.g. `Round 1`, `Semifinal`, `Final` |
| `finalGames` | number | Default 3 |
| `championUid` | string \| null | |
| `createdBy`, `lockedAt`, `completedAt` | | |

## `brackets/{bracketId}/matches/{matchId}`

`matchId` is readable, e.g. `R1-A`, `SF-E`, `FINAL`.

| Field | Type | Notes |
|---|---|---|
| `round` | number | |
| `table` | string | `"A"`, `"B"`, … |
| `slots` | array of `{ uid \| null, source }` | `source` is either `{ seed: n }` or `{ matchId: "R1-A", place: 1 }` |
| `status` | `"waiting_for_players" \| "ready" \| "in_progress" \| "complete"` | `ready` means every slot is filled |
| `checkedIn` | string[] | UIDs that tapped "I'm here" (`checkInMatch`) |
| `gamesToPlay` | number | 1, or `finalGames` for the final |
| `gameIds` | string[] | Games played for this match |
| `standings` | array of `{ uid, points, wins, lastPlace }` | Totals across the match's games |
| `advancing` | string[] | UIDs that advance (top 2), or the champion's UID for the final |
| `override` | `{ by, at, reason }` \| null | |

## `auditLog/{autoId}`

`{ actorUid, action, target, before, after, reason, at }` is written by every admin callable.

---

## Indexes (`firestore.indexes.json`)

| Collection | Fields | Used by |
|---|---|---|
| `games` | `status ASC, createdAt DESC` | Lobby list (`status == "lobby"`) |
| `games` | `bracketId ASC, status ASC` | TV view of live bracket tables |
| `results` | `playerUids ARRAY_CONTAINS, finishedAt DESC` | My game history; leaderboard recompute |
| `results` | `seasonId ASC, groupKey ASC, finishedAt DESC` | Anti-collusion check |
| `leaderboard/{s}/entries` | `score DESC, winRate DESC, avgPlace ASC` | Leaderboard |

## Security rules

Draft `firestore.rules`. Every client write is denied. Reads require a verified company account.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function isEmployee() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.matches('.*@nuesynergy[.]com$');
    }
    function isAdmin() {
      return isEmployee() && request.auth.token.admin == true;
    }

    // Default deny.
    match /{document=**} {
      allow read, write: if false;
    }

    match /config/{doc}                         { allow read: if isEmployee(); }
    match /users/{uid}                          { allow read: if isEmployee(); }
    match /seasons/{seasonId}                   { allow read: if isEmployee(); }
    match /results/{gameId}                     { allow read: if isEmployee(); }
    match /leaderboard/{seasonId}/entries/{uid} { allow read: if isEmployee(); }
    match /brackets/{bracketId}                 { allow read: if isEmployee(); }
    match /brackets/{bracketId}/matches/{m}     { allow read: if isEmployee(); }
    match /auditLog/{id}                        { allow read: if isAdmin(); }

    match /games/{gameId} {
      allow read: if isEmployee();

      match /events/{seq} {
        allow read: if isEmployee();
      }
      match /hands/{uid} {
        allow read: if isEmployee() && request.auth.uid == uid;
      }
      // /private/* falls through to default deny.
    }
  }
}
```

Rules tests are required for each row of the access table in [architecture.md §5](architecture.md#5-security-model-summary). In particular they must prove that a player **cannot** read another player's hand or `private/state`, and that a non-company account cannot read anything. See [testing-and-deployment.md](testing-and-deployment.md).
