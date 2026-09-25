# Data Model

Related: [Architecture](architecture.md) · [API](api.md) · [Game engine](game-engine.md) · [Tournament](tournament.md)

**Conventions**
- Firestore timestamps are `Timestamp` values set by the server. RTDB timestamps are milliseconds since the epoch (`ServerValue.TIMESTAMP`).
- Cloud Functions (Admin SDK) write **every** Firestore document. The only client writes are to the player's own RTDB nodes.
- IDs: `uid` is the Firebase Auth UID. Other IDs are auto-generated unless noted.
- Engine types (`Card`, `Color`, `Phase`, `PlayerGameStats`) are defined in [game-engine.md §2](game-engine.md#2-types).

## Collection map

```
Firestore
  config/app                                   # currentSeasonId, rosterRequired, teams toggles, feature flags
  roster/{emailLower}                          # HR roster (admin only)
  users/{uid}
  displayNames/{lowercaseName}                # { uid } — reservation that keeps display names unique (server only)
  seasons/{seasonId}
  games/{gameId}                               # public state
  games/{gameId}/hands/{uid}                   # owner-only
  games/{gameId}/private/state                 # server-only
  games/{gameId}/events/{seq}                  # public move log
  results/{gameId}                             # every finished human game (casual, ranked, bracket)
  leaderboard/{seasonId}/entries/{uid}
  departmentCup/{seasonId}/entries/{dept}
  passport/{uid}
  playerStats/{seasonId}_{uid}                 # aggregate counters for awards + Wrapped
  brackets/{bracketId}
  brackets/{bracketId}/matches/{matchId}
  picks/{bracketId}_{uid}
  pickem/{bracketId}/entries/{uid}
  inbox/{uid}/items/{itemId}
  announcements/{id}
  tv/state
  awards/{seasonId}
  hallOfFame/{seasonId}
  wrapped/{seasonId}_{uid}
  auditLog/{autoId}

Realtime Database
  /status/{uid}
  /emotes/{gameId}/{uid}
  /reactions/{targetId}/{uid}                  # targetId = matchId | "bracket"
```

---

## `config/app`

| Field | Type | Notes |
|---|---|---|
| `currentSeasonId` | string | |
| `rosterRequired` | boolean | If false, `saveProfile` activates any company email right away |
| `departments` | string[] | Picker options when the roster has no entry for someone |
| `teams` | map | `{ digest, unoHour, newLeader, matchResults }`, each a boolean |
| `features` | map | Kill switches, e.g. `{ emotes, reactions, pickem, nudges, sound }` |

## `roster/{emailLower}` (admin only)

`{ name, department, office?, importedAt }`. Imported from a CSV with `importRoster`. **Never committed to git.**

## `users/{uid}`

| Field | Type | Notes |
|---|---|---|
| `email` | string | Lowercase |
| `status` | `"pending" \| "active" \| "disabled"` | Mirrors the `active` claim. Pending users can read only their own doc. |
| `displayName` | string | 2–24 characters, unique (case-insensitive) |
| `department` | string | From the roster or the picker |
| `avatarId`, `avatarColor` | string | Preset avatar key and one of 8 colors |
| `frameId`, `cardBackId` | string \| null | Cosmetics (P2) |
| `signatureCard` | `Card['value']` \| null | Shown on intro cards |
| `attendingEvent` | `"yes" \| "no" \| "maybe"` | Only `yes` is eligible for seeding |
| `settings` | map | `{ effects: 'full' \| 'reduced' \| 'off', sound: bool, haptics: bool, emotesMuted: bool }` |
| `isAdmin` | boolean | Display mirror of the claim |
| `activeGameId` | string \| null | The one table a player is seated at |
| `tutorialDone` | boolean | |
| `createdAt`, `updatedAt`, `lastSeenAt`, `firstGameAt` | Timestamp | `firstGameAt` feeds the time-to-first-game metric |

## `seasons/{seasonId}`

| Field | Type | Notes |
|---|---|---|
| `name` | string | "Connections 2026" |
| `status` | `"setup" \| "qualifying" \| "locked" \| "event" \| "complete"` | `event` switches clients to the Event Hub |
| `qualifierStart`, `qualifierEnd` | Timestamp | |
| `timezone` | string | `America/Chicago`. Used for Uno Hours and the per-day anti-collusion limit. |
| `unoHours` | array | `[{ days: [1,2,3,4,5], start: "12:00", end: "12:45" }, { days: [1..5], start: "16:00", end: "16:30" }]` |
| `timers` | map | `{ casualMs: 30000, rankedMs: 30000, bracketMs: 20000, awayMs: 5000, graceMs: 1500 }` |
| `finalLap` | map | `{ qualifierMin: 20, bracketMin: 12 }` |
| `scoring` | map | `{ pointsByTableSize: { "3": [8,4,1], "4": [10,6,3,1] }, bestN: 10, minGames: 3, maxSameGroupPerDay: 2, minTurnsForPoints: 12 }` |
| `cup` | map | `{ topN: 3, participationBonus: 2, participationMinGames: 3 }` |
| `pickem` | map | `{ tableWinnerPts: 3, championPts: 10 }` |
| `bracketSize`, `finalGames` | number | 16, 3 |
| `activeBracketId` | string \| null | |
| `pausedAt` | Timestamp \| null | Set by `pauseAll` |

## `games/{gameId}` (public state)

| Field | Type | Notes |
|---|---|---|
| `seasonId` | string | |
| `status` | `"lobby" \| "in_progress" \| "finished" \| "abandoned" \| "voided"` | |
| `requestedMode` / `mode` | `"casual" \| "ranked"` / `"casual" \| "ranked" \| "bracket"` | `mode` is decided at start |
| `collusionWarning` | boolean | Lobby: this group has reached the per-day ranked limit |
| `hostUid` | string | |
| `bracketId`, `matchId`, `matchGameNumber`, `physicalTable` | \| null | Bracket games only |
| `seats` | array of `{ uid, displayName, avatarId, avatarColor, department }` | Turn order when `direction = 1` |
| `seatUids` | string[] | Mirror of seat uids, so lobby logic doesn't depend on engine state |
| `autoStart` | boolean | Quick Match tables start themselves when full |
| `maxSeats` | 2–4 | |
| `handCounts` | map `uid → n` | |
| `topCard`, `currentColor`, `direction`, `turnUid`, `phase` | | See the engine |
| `drawnCardPlayable` | boolean | |
| `unoPending` | string \| null | |
| `away` | map `uid → bool` | |
| `forfeited` | string[] | |
| `drawPileCount` | number | |
| `turnCount` | number | Completed turns. Used for the 12-turn minimum for ranked points. |
| `turnMs` | number | The timer length for this game's mode |
| `turnDeadline` | Timestamp \| null | Includes the grace period |
| `finalLapAt` | Timestamp \| null | `startedAt + cap` |
| `finalLap` | `{ active: bool, remaining: string[] }` | Players who still get their last turn |
| `paused` | boolean | |
| `version` | number | +1 on every change |
| `lastEventSeq` | number | |
| `placements` | string[] \| null | |
| `createdAt`, `startedAt`, `finishedAt`, `updatedAt` | Timestamp | |

## `games/{gameId}/hands/{uid}`

`{ cards: Card[], drawnCardId: string | null, version: number }`

## `games/{gameId}/private/state` (server only)

| Field | Type | Notes |
|---|---|---|
| `drawPile`, `discardPile` | `Card[]` | The last element is the top |
| `seed`, `rngState` | number | mulberry32 |
| `consecutiveTimeouts` | map | |
| `stats` | map `uid → PlayerGameStats` | Accumulated by the engine (+4s played, catches, peak hand size, …) |
| `recentMoveIds` | map `clientMoveId → version` | Last 50 |

## `games/{gameId}/events/{seq}`

`seq` is zero-padded (`"000042"`). The fields are `type`, `uid`, `card`, `count`, `targetUid`, `color`, and `at`.

`type` is one of: `game_started`, `card_played`, `cards_drawn`, `turn_passed`, `color_chosen`, `uno_called`, `uno_caught`, `timeout`, `player_forfeited`, `deck_reshuffled`, `final_lap`, `paused`, `resumed`, `game_finished`.

Events drive the [animation pipeline](../design/experience-and-motion.md#4-the-event-to-animation-pipeline). Draws record only a count.

## `results/{gameId}`

Written in the transaction that finishes **any human game**. Practice games are local and write nothing.

| Field | Type | Notes |
|---|---|---|
| `seasonId`, `mode`, `bracketId?`, `matchId?` | | |
| `tableSize`, `turnCount` | number | |
| `placements` | array of `{ uid, department, place, points, counts, cardsLeft, handValue, forfeited, stats: PlayerGameStats }` | `counts` = this entry counts toward the qualifier score (see [tournament §1](tournament.md#which-results-count)) |
| `playerUids` | string[] | For `array-contains` queries |
| `groupKey` | string | Sorted UIDs joined with `_` |
| `endedBy` | `"empty_hand" \| "final_lap" \| "last_player_standing"` | |
| `finishedAt` | Timestamp | |
| `voided` | boolean | |

## `leaderboard/{seasonId}/entries/{uid}`

`{ displayName, avatarId, avatarColor, department, score, rankedGames, wins, winRate, avgPlace, winStreak, countedGameIds[], eligible, attendingEvent, scoreReachedAt, updatedAt }`

`winStreak` is the current run of consecutive ranked wins, which drives the 🔥 flame (X13). `scoreReachedAt` is the final tiebreaker.

## `departmentCup/{seasonId}/entries/{dept}`

`{ department, cupScore, topScores: [{uid, score}] (top 3), participants, participationBonus, memberCount, updatedAt }`

## `passport/{uid}`

| Field | Type | Notes |
|---|---|---|
| `opponents` | map `uid → { displayName, department, firstGameId, firstAt, games }` | Every human game counts: casual, ranked, and bracket |
| `departments` | map `dept → count` | |
| `distinctCoworkers` | number | |
| `crossDeptPairs` | number | Distinct opponents from other departments |
| `milestones` | string[] | `coworkers_5`, `coworkers_10`, `coworkers_20`, `all_departments`, `tutorial` |
| `updatedAt` | Timestamp | |

## `playerStats/{seasonId}_{uid}`

Aggregate counters, recomputed from `results`: `{ games, humanGames, wins, wild4Played, draw2Played, catches, timesCaught, unoCalls, maxCardsHeldInWin, cardsPlayedByValue: map, wild4Victims: map uid → n }`. Used for awards (E14) and Wrapped (R1).

## `brackets/{bracketId}`

`{ seasonId, status: draft|locked|in_progress|complete, size, seeds[{seed, uid, displayName, score}], rounds[{number, name, matchIds[]}], finalGames, championUid, createdBy, lockedAt, completedAt }`

## `brackets/{bracketId}/matches/{matchId}`

`matchId` examples: `R1-A`, `SF-E`, `FINAL`.

| Field | Type | Notes |
|---|---|---|
| `round`, `table` | number, string | |
| `physicalTable` | number | The printed table sign number (1–4) that this match is played at. Set by the admin, with a default. |
| `slots` | array of `{ uid \| null, source }` | |
| `status` | `waiting_for_players \| ready \| in_progress \| complete` | |
| `checkedIn` | string[] | |
| `gamesToPlay`, `gameIds` | number, string[] | |
| `standings` | array of `{ uid, points, wins, lastPlace }` | |
| `advancing` | string[] | |
| `override` | `{ by, at, reason }` \| null | |

## `picks/{bracketId}_{uid}`

`{ uid, champion: uid | null, championLockedAt, tables: map matchId → { uid, at } }`. A pick is accepted only while its match is not yet `in_progress`, and the champion pick only before Round 1 starts.

## `pickem/{bracketId}/entries/{uid}`

`{ displayName, avatarId, points, correct, champion: bool, updatedAt }`

## `inbox/{uid}/items/{itemId}`

`{ type: 'match_ready' | 'selected' | 'table_forming' | 'rematch' | 'announcement', title, body, link, takeover: bool, createdAt, expiresAt, seenAt }`. The client shows unseen items that haven't expired. `takeover` items open full-screen (N3).

## `announcements/{id}`

`{ text, level: 'info' | 'urgent', createdBy, createdAt, expiresAt, active }`. Every client and the TV show active announcements as a banner.

## `tv/state`

`{ scene: 'bracket' | 'intros' | 'selection' | 'pickem' | 'cup' | 'featured' | 'awards' | 'champion', featuredGameId, selectionStep, introMatchId, awardsStep, autoCycle, revealHands (P2), updatedAt }`

`selectionStep`: 0 is the title card, *k* means *k* seeds revealed (bottom seed first), and `size + 1` is the finale. `introMatchId` is the match whose walk-out cards the Player Intros scene shows (null = the next table up).

## `awards/{seasonId}`, `hallOfFame/{seasonId}`, `wrapped/{seasonId}_{uid}`

- **awards:** `{ items: [{ key, title, uid, displayName, statLine }], computedAt }`
- **hallOfFame:** `{ championUid, finalTable[], awards[], cupWinner, pickemWinner, bracketSnapshot }`
- **wrapped:** `{ slides: [{ kind, value, detail }], summary: {...}, builtAt }`

## `auditLog/{autoId}`

`{ actorUid, action, target, before, after, reason, at }`

---

## Realtime Database

```json
{
  "status":    { "$uid": { "state": "online|offline", "activity": "lobby|game|spectating|tv", "gameId": "…", "at": 0 } },
  "emotes":    { "$gameId": { "$uid": { "e": "nice|lol|shock|fire|gg|evil|eyes|salute", "at": 0 } } },
  "reactions": { "$targetId": { "$uid": { "r": "fire|clap|shock|party", "at": 0 } } }
}
```

**`database.rules.json` (draft)**
```json
{
  "rules": {
    ".read": false, ".write": false,
    "status": {
      ".read": "auth != null && auth.token.active === true",
      "$uid": {
        ".write": "auth != null && auth.uid === $uid && auth.token.active === true",
        ".validate": "newData.hasChildren(['state','at']) && newData.child('state').val().matches(/^(online|offline)$/)"
      }
    },
    "emotes": {
      "$gameId": {
        ".read": "auth != null && auth.token.active === true",
        "$uid": {
          ".write": "auth != null && auth.uid === $uid && auth.token.active === true && (!data.exists() || newData.child('at').val() >= data.child('at').val() + 3000)",
          ".validate": "newData.child('e').val().matches(/^(nice|lol|shock|fire|gg|evil|eyes|salute)$/) && newData.child('at').val() <= now + 1000"
        }
      }
    },
    "reactions": {
      "$targetId": {
        ".read": "auth != null && auth.token.active === true",
        "$uid": {
          ".write": "auth != null && auth.uid === $uid && auth.token.active === true && (!data.exists() || newData.child('at').val() >= data.child('at').val() + 1000)",
          ".validate": "newData.child('r').val().matches(/^(fire|clap|shock|party)$/) && newData.child('at').val() <= now + 1000"
        }
      }
    }
  }
}
```
Clients write `at` as `ServerValue.TIMESTAMP` (it resolves to `now`), so they can't fake the time to get around the rate limit.

## Firestore indexes (`firestore.indexes.json`)

| Collection | Fields | Used by |
|---|---|---|
| `games` | `status ASC, createdAt DESC` | Lobby list |
| `games` | `status ASC, requestedMode ASC, createdAt ASC` | Quick Match, forming nudges |
| `games` | `bracketId ASC, status ASC` | TV and Mission Control |
| `results` | `playerUids ARRAY_CONTAINS, finishedAt DESC` | History, recomputing the leaderboard and Passport |
| `results` | `seasonId ASC, groupKey ASC, finishedAt DESC` | Anti-collusion |
| `leaderboard/{s}/entries` | `score DESC, winRate DESC, avgPlace ASC` | Leaderboard |
| `leaderboard/{s}/entries` | `department ASC, score DESC` | Department Cup recompute |
| `departmentCup/{s}/entries` | `cupScore DESC` | Cup board |
| `pickem/{b}/entries` | `points DESC` | Pick'em board |
| `inbox/{uid}/items` | `seenAt ASC, createdAt DESC` | Inbox |

## Security rules

Draft `firestore.rules`. All client writes are denied.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function signedInEmployee() {
      return request.auth != null
        && request.auth.token.email.matches('.*@nuesynergy[.]com$');
    }
    function isPlayer() { return signedInEmployee() && request.auth.token.active == true; }
    function isAdmin()  { return signedInEmployee() && request.auth.token.admin == true; }

    match /{document=**} { allow read, write: if false; }

    match /config/{doc}            { allow read: if signedInEmployee(); }
    match /users/{uid}             { allow read: if isPlayer() || (signedInEmployee() && request.auth.uid == uid); }
    match /roster/{email}          { allow read: if isAdmin(); }
    match /auditLog/{id}           { allow read: if isAdmin(); }

    match /seasons/{id}                         { allow read: if isPlayer(); }
    match /results/{id}                         { allow read: if isPlayer(); }
    match /leaderboard/{s}/entries/{uid}        { allow read: if isPlayer(); }
    match /departmentCup/{s}/entries/{d}        { allow read: if isPlayer(); }
    match /passport/{uid}                       { allow read: if isPlayer(); }
    match /playerStats/{id}                     { allow read: if isPlayer(); }
    match /brackets/{b}                         { allow read: if isPlayer(); }
    match /brackets/{b}/matches/{m}             { allow read: if isPlayer(); }
    match /picks/{id}                           { allow read: if isPlayer(); }
    match /pickem/{b}/entries/{uid}             { allow read: if isPlayer(); }
    match /announcements/{id}                   { allow read: if isPlayer(); }
    match /tv/{doc}                             { allow read: if isPlayer(); }
    match /awards/{s}                           { allow read: if isPlayer(); }
    match /hallOfFame/{s}                       { allow read: if isPlayer(); }
    match /wrapped/{id}                         { allow read: if isPlayer(); }
    match /inbox/{uid}/items/{item}             { allow read: if isPlayer() && request.auth.uid == uid; }

    match /games/{gameId} {
      allow read: if isPlayer();
      match /events/{seq}  { allow read: if isPlayer(); }
      match /hands/{uid}   { allow read: if isPlayer() && request.auth.uid == uid; }
      // private/* → default deny
    }
  }
}
```

Rules tests must cover every row of the [access table](architecture.md#5-security-model-summary). They must also prove the following:
- A **pending** user can read only their own `users` doc and `config`.
- A player can't read another player's hand, anything in `private/*`, or another player's inbox.
- RTDB rejects writes to another user's node, values outside the allowed list, and writes faster than the rate limit.
