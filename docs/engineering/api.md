# API: Cloud Functions + Realtime Database client writes

Related: [Architecture](architecture.md) · [Data model](data-model.md) · [Game engine](game-engine.md) · [Tournament](tournament.md)

Every change to Firestore made by a client goes through a **2nd-gen callable** (`onCall`) in `us-central1`. Request schemas are zod definitions in `packages/shared/schemas.ts`, used by both the functions and the web app's `api/` wrappers. The only client writes are **RTDB** presence, emotes, and reactions ([§6](#6-rtdb-client-writes-no-function)).

## 1. Conventions

**Guards.** Every callable runs these in order:
1. `requireEmployee(req)`: signed in, `email_verified`, and a company email. Otherwise `permission-denied`.
2. `requirePlayer(req)`: the `active` claim. Only `saveProfile` skips this, because it's the call that activates a user.
3. `requireAdmin(req)`: only for admin functions.
4. `schema.parse(req.data)`. Otherwise `invalid-argument`.
5. Update `users.lastSeenAt` (throttled to once a minute).

**Errors.** Functions throw `HttpsError(code, message, { reason, hint? })`. `hint` is the engine's friendly message, which the client shows as a toast (PRD O4).

| `code` | `reason` values |
|---|---|
| `unauthenticated` / `permission-denied` | `NOT_SIGNED_IN`, `NOT_EMPLOYEE`, `PENDING_APPROVAL`, `DISABLED`, `NOT_ADMIN`, `NOT_SEATED`, `NOT_HOST`, `NOT_IN_MATCH` |
| `invalid-argument` | `BAD_REQUEST` |
| `not-found` | `GAME_NOT_FOUND`, `MATCH_NOT_FOUND`, `NO_MATCH_AT_TABLE` |
| `failed-precondition` | Engine errors (`NOT_YOUR_TURN`, `ILLEGAL_CARD`, …), plus `STALE_STATE`, `PAUSED`, `GAME_FULL`, `ALREADY_SEATED_ELSEWHERE`, `NOT_ENOUGH_PLAYERS`, `DEADLINE_NOT_REACHED`, `NAME_TAKEN`, `BRACKET_LOCKED`, `PICKS_LOCKED`, `PLAYERS_NOT_PRESENT` |
| `aborted` | `CONTENTION`. The client retries once. |

### Idempotency
Move requests include `clientMoveId` (a UUID v4 per tap) and `expectedVersion`. Inside the transaction:
1. If `recentMoveIds[clientMoveId]` exists, return `{ ok: true, version, duplicate: true }` and write nothing.
2. If `expectedVersion !== game.version`, throw `STALE_STATE`. The client waits for its listener to catch up and doesn't retry automatically.
3. Otherwise apply the move and store the ID, keeping the last 50.

`claimTimeout` needs only `expectedVersion`.

### Move transaction template (the server owns the clock; see ADR-4)

```ts
export const playCard = onCall(moveOpts, async (req) => {
  const uid = requirePlayer(req);
  const input = PlayCardInput.parse(req.data);
  return db.runTransaction(async (tx) => {
    const g = await loadGame(tx, input.gameId);                 // public + hands + private
    const dup = checkIdempotency(g, input); if (dup) return dup;
    if (g.public.paused) throw fail('PAUSED');
    let state = joinState(g.public, g.hands, g.priv);
    const now = Date.now();
    const events: EngineEvent[] = [];

    if (g.public.finalLapAt && now >= g.public.finalLapAt.toMillis() && !state.finalLap.active) {
      const fl = applyAction(state, { type: 'startFinalLap' });  // always ok
      state = fl.state; events.push(...fl.events);
    }
    const res = applyAction(state, { type: 'play', uid, ...pick(input) });
    if (!res.ok) throw engineError(res.error, res.message);
    events.push(...res.events);

    const deadline = res.turnChanged
      ? now + turnMsFor(g.public, res.state) + season.timers.graceMs   // awayMs if the next player is away
      : g.public.turnDeadline;                                         // e.g. callUno keeps the clock running
    writeGame(tx, g, res.state, events, { deadline, clientMoveId: input.clientMoveId });
    if (res.state.phase === 'finished') finishGame(tx, g, res.state);  // results/{id}, clear activeGameId
    return { ok: true, version: res.state.version };
  });
});
```

`finishGame` writes `results/{gameId}` for **every** human game. It calculates each placement's `points` and `counts` using the rules in [tournament.md](tournament.md#which-results-count).

## 2. Player callables

### Profile and onboarding
| Function | Request | Response | Notes |
|---|---|---|---|
| `saveProfile` | `{ displayName, avatarId, avatarColor?, department?, attendingEvent, signatureCard?, settings? }` | `{ ok, status: 'active' \| 'pending' }` | Creates or updates the user. On the first call it looks up `roster/{email}` to prefill and **activate** the user (sets the `active` claim). If the user isn't on the roster and `rosterRequired` is on, they stay pending. The client then calls `getIdToken(true)`. The display name must be unique (`NAME_TAKEN`). |
| `completeTutorial` | `{}` | `{ ok }` | Sets `tutorialDone` and adds the Passport milestone `tutorial` |

### Lobby
| Function | Request | Response | Notes |
|---|---|---|---|
| `createTable` | `{ maxSeats: 2..4, requestedMode }` | `{ gameId }` | The caller becomes host in seat 0. `ALREADY_SEATED_ELSEWHERE` if they're at another table. |
| `joinTable` | `{ gameId }` | `{ ok }` | The table must be in `lobby` with a free seat and must not be a bracket game. Recomputes `collusionWarning`. |
| `leaveTable` | `{ gameId }` | `{ ok }` | Lobby only. Hands the host role to the next seat, and deletes the table if it's empty. |
| `inviteToTable` | `{ gameId, uid }` | `{ ok }` | Writes an inbox item (`table_forming` with a Join link) for the invitee. At most 5 invites per minute. |
| `quickMatch` | `{}` | `{ gameId }` | Looks at open ranked lobbies and picks the one with the **most seated players the caller hasn't played** (using their Passport), then the oldest. If there isn't one, creates a 4-seat ranked table. Starts the game automatically when the 4th player joins. |
| `startGame` | `{ gameId }` | `{ ok, mode }` | Host only. Needs 2 or more players. `mode = ranked` only if requested **and** there are 3+ players **and** the qualifier window is open **and** the per-day group limit hasn't been hit. Otherwise `casual`. Sets `turnMs`, `finalLapAt`, and the seed (`crypto.randomInt`), then runs `createGame`. |
| `rematch` | `{ fromGameId }` | `{ gameId }` | Creates a lobby with the same mode and seats the caller. Sends a `rematch` inbox item to the other players. |

### Moves (every request includes `gameId`, `clientMoveId`, and `expectedVersion`)
| Function | Extra fields | Engine action |
|---|---|---|
| `playCard` | `cardId`, `chosenColor?`, `declareUno?` | `play` |
| `drawCard` | — | `draw` |
| `passTurn` | — | `pass` |
| `chooseColor` | `color` | `chooseColor` |
| `callUno` | — | `callUno` |
| `catchUno` | `targetUid` | `catchUno` |
| `claimTimeout` | no `clientMoveId` | `timeout`. Any player may call it, seated or not. `DEADLINE_NOT_REACHED` if it's too early. Applies `startFinalLap` first if it's due. |
| `leaveGame` | — | `forfeit`. Clears `activeGameId`. |

All moves are rejected with `PAUSED` while `paused` is set. Response: `{ ok: true, version, duplicate? }`.

### Event day
| Function | Request | Response | Notes |
|---|---|---|---|
| `checkInMatch` | `{ bracketId, matchId }` | `{ ok, gameId? }` | The caller must hold a slot in a `ready` match. Adds them to `checkedIn`. When everyone has checked in, the game is created and started (the same path as `startMatch`). For the final, each later game starts automatically when the previous one finishes. |
| `checkInAtTable` | `{ physicalTable }` | `{ ok, matchId, gameId? }` | Used by the QR code on the printed table sign (`/table/:n`). Finds the active bracket's `ready` or `in_progress` match at that table where the caller holds a slot, then behaves like `checkInMatch`. `NO_MATCH_AT_TABLE` means "You're not playing at this table right now." The client then shows where the player *should* be. |
| `submitPicks` | `{ bracketId, champion?: uid, tables?: Record<matchId, uid> }` | `{ ok, rejected: matchId[] }` | Merges the picks into `picks/{bracketId}_{uid}`. A table pick is rejected once its match is `in_progress`, and the champion pick once Round 1 has started. |

### Inbox
| Function | Request | Notes |
|---|---|---|
| `markInboxSeen` | `{ itemIds: string[] }` | Sets `seenAt` |

## 3. Admin callables (need the `admin` claim; each one writes to `auditLog`)

| Function | Request | Effect |
|---|---|---|
| `setSeason` | partial season fields (status, window, `unoHours`, timers, `finalLap`, scoring, cup, pickem, `bracketSize`) | Updates the season. When status changes to `event`, every client switches to the Event Hub. |
| `setConfig` | partial `config/app` | Toggles the roster requirement, Teams post types, and feature kill switches |
| `importRoster` | `{ rows: Array<{ email, name, department, office? }>, replace?: boolean }` | Upserts `roster/*`. Existing pending users whose email is now on the roster are activated. |
| `approveUser` | `{ uid }` | Sets the `active` claim and status. Sends an inbox welcome. |
| `adminUpdateUser` | `{ uid, displayName?, department?, attendingEvent?, status? }` | Moderation. Setting `status: 'disabled'` revokes the claim and refresh tokens. |
| `voidGame` | `{ gameId, reason }` | Marks the result voided and the game `voided`. Triggers recompute everything that depends on it. A bracket match goes back to `ready`. |
| `generateBracket` | `{ seasonId, size?, excludeUids? }` | Creates a draft ([algorithm](tournament.md#bracket-generation-general-n)) with default `physicalTable` values |
| `editBracketSeeds` | `{ bracketId, seeds }` | Draft only |
| `setPhysicalTables` | `{ bracketId, map: Record<matchId, number> }` | Sets which printed sign each match is played at |
| `lockBracket` | `{ bracketId }` | Draft → locked |
| `startMatch` | `{ bracketId, matchId, force? }` | Without `force`, requires everyone to have checked in (`PLAYERS_NOT_PRESENT`) |
| `overrideMatchResult` | `{ bracketId, matchId, placements: uid[], reason }` | Sets standings and advancement directly |
| `restartMatchGame` | `{ bracketId, matchId, reason }` | Voids the current game and creates a new one with the same seats |
| `pauseAll` / `resumeAll` | `{ reason? }` | Pause: `paused = true` on in-progress bracket games (casual games are left alone) and a `paused` event. Resume: shifts `turnDeadline` and `finalLapAt` forward by the pause length and emits `resumed`. |
| `broadcast` | `{ text, level, ttlMinutes }` | Creates an active `announcements` doc |
| `clearBroadcast` | `{ id }` | |
| `setTvScene` | `{ scene, featuredGameId?, autoCycle?, revealHands? }` | Writes `tv/state` |
| `advanceSelectionShow` | `{ bracketId, step?: number }` | Moves to the next reveal (or a given step). On each player's reveal, sends that player a `selected` takeover inbox item ("You're in! Seed 7 · Table C"). |
| `computeAwards` | `{ seasonId }` | Builds `awards/{seasonId}` from `playerStats`, the Passport, the Cup, and Pick'em ([tournament §6](tournament.md#6-awards)) |
| `buildWrapped` | `{ seasonId, uid? }` | Builds `wrapped/*` for everyone (or one user) and writes `hallOfFame` |
| `adminStats` | `{ seasonId }` | Returns the metrics in PRD §13, calculated with aggregate count queries |

## 4. Triggers

| Function | Trigger | Effect |
|---|---|---|
| `onResultWritten` | `results/{gameId}` written | For each player: (1) if the result is ranked, recompute their **leaderboard** entry from all their non-voided results where `counts` is true; (2) recompute their **Passport** from all their results; (3) recompute their **playerStats**; (4) set `firstGameAt` if it's not set yet. For bracket results, call `advanceBracket(matchId)`. |
| `onLeaderboardEntryWritten` | `leaderboard/{s}/entries/{uid}` | Recompute that department's **Department Cup** entry. If this player is now #1 and wasn't before, post "New #1!" to Teams (if enabled). |
| `onUserWritten` | `users/{uid}` | Copy name, avatar, department, and attendance into the leaderboard entry (and so into the Cup) |
| `onMatchWritten` | `brackets/{b}/matches/{m}` | Became `ready`: send `match_ready` takeover inbox items to its players. Became `complete`: recompute the **Pick'em** entries for everyone who picked this match, and post the result to Teams. The final completing: set `championUid` and bracket `complete`. |
| `onGameWritten` | `games/{gameId}` | A ranked lobby now has exactly 1 free seat: read RTDB `/status`, find online players who aren't at a table, and send each a `table_forming` inbox item, at most once per player every 2 minutes (PRD L7). |

`advanceBracket` recomputes standings from the match's results (it doesn't add increments), sets `advancing` once `gameIds.length == gamesToPlay`, and fills the slots in later matches that depend on this one.

## 5. Scheduled jobs (`onSchedule`, time zone `America/Chicago`)

| Function | Schedule | Effect |
|---|---|---|
| `cleanupStaleGames` | daily 03:00 | Marks lobbies idle for more than 30 minutes and in-progress games idle for more than 2 hours as abandoned. Clears their players' `activeGameId`. |
| `teamsDigest` | weekdays 09:00 | Posts an Adaptive Card to Teams: top 5, biggest climber, Department Cup, and today's Uno Hours |
| `unoHourAnnouncer` | every 5 min | When an Uno Hour from the season config starts, posts "Uno Hour is live" to Teams and adds an announcement banner that lasts as long as the Uno Hour |

## 6. RTDB client writes (no function)

| Path | Written by | Value | Limits |
|---|---|---|---|
| `/status/{uid}` | own client on connect, plus `onDisconnect` | `{ state, activity, gameId?, at: TIMESTAMP }` | Schema-validated |
| `/emotes/{gameId}/{uid}` | own client | `{ e: EmoteKey, at: TIMESTAMP }` | One every 3s, allowed values only. Viewers show it only if the sender is seated. |
| `/reactions/{targetId}/{uid}` | own client | `{ r: ReactionKey, at: TIMESTAMP }` | One per second, allowed values only |

Rules are in [data-model.md §Realtime Database](data-model.md#realtime-database).

## 7. Client usage sketch

```ts
// apps/web/src/api/moves.ts
export const playCard = (g: PublicGame, cardId: string, o: { chosenColor?: Color; declareUno?: boolean }) =>
  call('playCard', { gameId: g.id, cardId, ...o, clientMoveId: crypto.randomUUID(), expectedVersion: g.version });

// apps/web/src/hooks/usePresence.ts
const ref = rtdbRef(db, `status/${uid}`);
onDisconnect(ref).set({ state: 'offline', at: serverTimestamp() });
set(ref, { state: 'online', activity, gameId: gameId ?? null, at: serverTimestamp() });
```
