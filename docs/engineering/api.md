# API — Cloud Functions

Related: [Architecture](architecture.md) · [Data model](data-model.md) · [Game engine](game-engine.md) · [Tournament](tournament.md)

Every client-initiated change is a **2nd-gen callable** (`onCall`) in `us-central1`. Request schemas are `zod` objects in `functions/src/schemas.ts`, re-exported to the web app through the `api/` wrappers.

## Conventions

**Guards.** Every callable runs these checks in order:
1. `requireEmployee(req)`: authenticated, `email_verified`, company domain. Otherwise `permission-denied`.
2. `requireAdmin(req)`: only for admin functions. Checks `req.auth.token.admin === true`.
3. `schema.parse(req.data)`. Otherwise `invalid-argument`.

**Errors.** Functions throw `HttpsError(code, message, { reason })`. The client shows a toast based on `reason`.

| `code` | Typical `reason` values |
|---|---|
| `unauthenticated` / `permission-denied` | `NOT_SIGNED_IN`, `NOT_EMPLOYEE`, `NOT_ADMIN`, `NOT_SEATED`, `NOT_HOST` |
| `invalid-argument` | `BAD_REQUEST` (zod message in details) |
| `not-found` | `GAME_NOT_FOUND`, `MATCH_NOT_FOUND` |
| `failed-precondition` | Engine errors (`NOT_YOUR_TURN`, `ILLEGAL_CARD`, `ILLEGAL_WILD_DRAW_FOUR`, `WRONG_PHASE`, …), plus `STALE_STATE`, `GAME_FULL`, `ALREADY_SEATED_ELSEWHERE`, `NOT_ENOUGH_PLAYERS`, `QUALIFIERS_CLOSED`, `DEADLINE_NOT_REACHED`, `BRACKET_LOCKED` |
| `aborted` | `CONTENTION` (the transaction was retried too many times, so the client retries once) |

### Idempotency
Every **move** request carries `clientMoveId` (a UUID v4 made per user tap) and `expectedVersion` (the `version` of the game doc the client last saw).

Inside the transaction:
1. If `private.recentMoveIds[clientMoveId]` already exists, return `{ ok: true, version: <stored>, duplicate: true }` and write nothing. This covers double-taps and network retries.
2. Otherwise, if `expectedVersion !== game.version`, throw `failed-precondition / STALE_STATE`. The client waits for its listener to catch up and doesn't auto-retry the move.
3. Otherwise, apply the move and record `recentMoveIds[clientMoveId] = newVersion`, keeping only the last 50.

`claimTimeout` needs only `expectedVersion`, because a duplicate call is naturally rejected as stale.

### Move transaction template

```ts
export const playCard = onCall(opts, async (req) => {
  const uid = requireEmployee(req);
  const input = PlayCardInput.parse(req.data);
  return db.runTransaction(async (tx) => {
    const { game, hands, priv } = await loadGame(tx, input.gameId);     // 1 + n + 1 reads
    const dup = checkIdempotency(priv, input, game);  if (dup) return dup;
    const state = joinState(game, hands, priv);
    const res = applyAction(state, { type: 'play', uid, ...pick(input) });
    if (!res.ok) throw engineError(res.error);
    writeGame(tx, input.gameId, res, input.clientMoveId);              // public + changed hands + private + events
    if (res.state.phase === 'finished') finishGame(tx, input.gameId, game, res.state); // results + clear activeGameId
    return { ok: true, version: res.state.version };
  });
});
```

## Player functions

### Profile
| Function | Request | Response | Notes |
|---|---|---|---|
| `saveProfile` | `{ displayName: string(2..24), avatarId: AvatarId, attendingEvent: boolean }` | `{ ok }` | Creates the user doc on first call. The display name must be unique (case-insensitive) or it fails with `failed-precondition / NAME_TAKEN`. Denormalizes to leaderboard entries. |

### Lobby
| Function | Request | Response | Notes |
|---|---|---|---|
| `createTable` | `{ maxSeats: 2..4, requestedMode: 'casual' \| 'ranked' }` | `{ gameId }` | Caller becomes host and takes seat 0. Fails with `ALREADY_SEATED_ELSEWHERE` if the caller's `users.activeGameId` points to an unfinished game. |
| `joinTable` | `{ gameId }` | `{ ok }` | The game must be in `lobby` with a free seat, and the caller must not be seated elsewhere. Bracket games can't be joined this way. |
| `leaveTable` | `{ gameId }` | `{ ok }` | Lobby only. Hands host to the next seat, and deletes the game if it's empty. |
| `quickMatch` | `{}` | `{ gameId }` | Finds the oldest ranked lobby with a free seat, or creates a 4-seat ranked table. Starts the game automatically when the 4th player joins. |
| `startGame` | `{ gameId }` | `{ ok, mode }` | Host only (admin for bracket games). Needs 2 or more seated. Works out the final `mode`: `ranked` only if requested **and** there are 3+ players **and** the qualifier window is open **and** the anti-collusion check passes ([tournament.md](tournament.md#anti-collusion)). Otherwise `casual`. Generates the seed with `crypto.randomInt`, runs `createGame`, and writes everything. |

### Bracket
| Function | Request | Response | Notes |
|---|---|---|---|
| `checkInMatch` | `{ bracketId, matchId }` | `{ ok, gameId? }` | The caller must hold a slot in a `ready` match. Adds them to `match.checkedIn`. When every slot has checked in, the match game is created and started automatically (the same path as `startMatch`), and its `gameId` is returned. For the final, check-in happens once, and each later game starts automatically when the previous one finishes. |

### Moves (all include `gameId`, `clientMoveId`, `expectedVersion`)
| Function | Extra fields | Engine action |
|---|---|---|
| `playCard` | `cardId`, `chosenColor?`, `declareUno?` | `play` |
| `drawCard` | — | `draw` |
| `passTurn` | — | `pass` |
| `chooseColor` | `color` | `chooseColor` |
| `callUno` | — | `callUno` |
| `catchUno` | `targetUid` | `catchUno` |
| `claimTimeout` | — (no `clientMoveId`) | `timeout`. The caller must be an employee (they don't have to be seated). Fails with `DEADLINE_NOT_REACHED` if `now < turnDeadline`. |
| `leaveGame` | — | `forfeit`. Clears the caller's `activeGameId`. |

**Response for every move:** `{ ok: true, version: number, duplicate?: true }`.

## Admin functions (need the `admin` claim; each writes an `auditLog` entry)

| Function | Request | Effect |
|---|---|---|
| `setSeason` | `{ seasonId, status?, qualifierStart?, qualifierEnd?, bracketSize?, scoring? }` | Updates the season doc |
| `adminUpdateUser` | `{ uid, displayName?, attendingEvent? }` | Moderates names and fixes attendance |
| `voidGame` | `{ gameId, reason }` | Sets `results.voided = true` and `games.status = 'voided'`. Recompute triggers run. If the game belongs to a bracket match, the match goes back to `ready`. |
| `generateBracket` | `{ seasonId, size?, excludeUids?: string[] }` | Builds a **draft** bracket from the eligible, attending leaderboard ([algorithm](tournament.md#bracket-generation-general-n)) |
| `editBracketSeeds` | `{ bracketId, seeds: Array<{ seed, uid }> }` | Draft only. Rebuilds the round-1 slots. |
| `lockBracket` | `{ bracketId }` | Draft → locked. Sets `season.status = 'locked'` if it's still `qualifying`. |
| `startMatch` | `{ bracketId, matchId, force?: boolean }` | Creates the bracket game with fixed seats and `mode = 'bracket'`, then starts it. Without `force`, every slot must be in `match.checkedIn` or it fails with `PLAYERS_NOT_PRESENT`. |
| `overrideMatchResult` | `{ bracketId, matchId, placements: string[], reason }` | Sets the match standings and advancing players directly, then advances the bracket |
| `restartMatchGame` | `{ bracketId, matchId, reason }` | Voids the current game of that match and creates a new one with the same seats |

## Triggers and scheduled jobs

| Function | Trigger | Effect |
|---|---|---|
| `onResultWritten` | `onDocumentWritten('results/{gameId}')` | For each player: reload their non-voided ranked results for the season, then recompute the `leaderboard` entry (best N, wins, avgPlace, eligible). For bracket results, call `advanceBracket(matchId)`. |
| `advanceBracket` (internal) | Called by the trigger above | Updates match standings. When `gameIds.length == gamesToPlay`, the match is marked `complete` and `advancing` is set, and those players fill their slots in the next round's matches. A next-round match moves to `ready` once all its slots are filled. The final sets `championUid`. It's idempotent: it recomputes from results instead of adding increments. |
| `onUserWritten` | `onDocumentWritten('users/{uid}')` | Copies `displayName`, `avatarId`, and `attendingEvent` into the leaderboard entry |
| `cleanupStaleGames` | `onSchedule('every day 03:00')` + manual run | Marks `lobby` games with `updatedAt > 30m` and `in_progress` games with `updatedAt > 2h` as `abandoned`, and clears those players' `activeGameId`. Abandoned ranked games get no result. |

## Client usage sketch

```ts
// apps/web/src/api/moves.ts
export async function playCard(game: PublicGame, cardId: string, opts: { chosenColor?: Color; declareUno?: boolean }) {
  return call('playCard', { gameId: game.id, cardId, ...opts,
                            clientMoveId: crypto.randomUUID(), expectedVersion: game.version });
}
```
