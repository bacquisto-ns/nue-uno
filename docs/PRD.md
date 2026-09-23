# Nue Uno — Product Requirements Document

| | |
|---|---|
| **Owner** | Brian Acquisto |
| **Status** | Draft for stakeholder review |
| **Last updated** | 2026-09-23 |
| **Target event** | Connections event, in office. Date TBD, planned for about 6 weeks out (week of Nov 2, 2026) |

---

## 1. Summary

Nue Uno is an internal web app where NueSynergy employees play Uno against each other in the browser. It runs a two-stage tournament:

1. **Qualifiers (online, about 2.5 weeks).** Players play **ranked** games from anywhere and earn placement points. The results appear on a live leaderboard.
2. **Event bracket (in office).** The top qualifiers who will be at the event are seeded into a table-based bracket. They play it on the app, live, while everyone watches the bracket on a big screen.

## 2. Goals and non-goals

### Goals
- **G1 — Connection.** Get people from different teams playing together before and during the event.
- **G2 — Fair seeding.** Produce a bracket seeding people trust. Games are server-validated, so no one can cheat, and grinding more games than everyone else does not win the leaderboard.
- **G3 — Smooth event day.** The live bracket runs without organizers doing manual bookkeeping. Results advance on their own, and the room can follow along on a big screen.
- **G4 — Zero friction to join.** Players sign in with just their work email and can be in a game within 60 seconds.

### Non-goals (MVP)
- Public or external access. The app is for `@nuesynergy.com` only.
- Handling prizes, money, or wagering in the app.
- Native mobile apps. The web app must work well on phone browsers.
- In-game chat, friends lists, or social features beyond playing together.
- House-rule variants (stacking, 7-0, jump-in). They are designed for, but not built.

## 3. Personas

| Persona | Description | Primary needs |
|---|---|---|
| **Player** | Any employee. Wide range of technical comfort. Plays on a laptop or phone. | Easy sign-in, quick games, clear rules, see their rank |
| **Tournament Admin** | Event organizer (1–3 people) | Control the qualifier window, see who's attending, generate and lock the bracket, fix mistakes |
| **Spectator** | Everyone at the event, watching a TV or projector | A readable live bracket and current table status from across the room |

## 4. Tournament lifecycle

```
Registration ──► Qualifier window ──► Seeding lock ──► Event-day bracket ──► Champion
(sign in,          (ranked games,       (admin confirms    (Round 1 → Semis →
 set name,          leaderboard live)    attendance,         Final table)
 mark attending)                         generates bracket)
```

| Phase | Target dates (tentative) | What's live |
|---|---|---|
| Soft launch / practice | Oct 12 – Oct 13 | Casual games only |
| Qualifier window | Oct 14 – Oct 30 | Ranked + casual games, leaderboard |
| Seeding lock | Oct 30 (end of day) | Ranked games close. The admin generates a **draft** bracket, shown to everyone as projected seeds. It is locked on event morning, once attendance is confirmed. |
| Event day | Week of Nov 2 (TBD) | Bracket games, spectator view |

Scoring details are in [tournament.md](engineering/tournament.md).

## 5. User stories and acceptance criteria

Priority: **P0** = must ship for the event. **P1** = should ship. **P2** = only if time allows.

### 5.1 Authentication and profile

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| A1 | As a player, I sign in with a magic link sent to my work email. | P0 | Entering an email sends a sign-in link. Clicking it on the same device signs me in with no password. On a different device, I'm asked to confirm my email. I stay signed in across browser restarts. |
| A2 | As the company, only employees can use the app. | P0 | Emails that aren't `@nuesynergy.com` are rejected in the UI. Even if someone bypasses the UI, the server and database rules deny every read and write for non-company or unverified accounts. |
| A3 | As a player, I set a display name and pick an avatar. | P0 | On first sign-in I'm prompted for a display name (2–24 characters, prefilled from my email) and one of about 12 preset avatars. I can change both later. |
| A4 | As a player, I tell the organizers whether I'll be in the office for the event. | P0 | My profile has an "I'll attend the in-office event" toggle. Only attending players are eligible for seeding. |
| A5 | As a player, I can sign out. | P0 | Signing out clears the session on that device. |

### 5.2 Lobby and matchmaking

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| L1 | As a player, I create a table and invite others. | P0 | Creating a table gives me a shareable link (`/t/{id}`). The table holds 2–4 players. As host, I can start once at least 2 have joined. |
| L2 | As a player, I join an open table from the lobby list. | P0 | The lobby shows open tables with the host's name, seats filled, and a Ranked or Casual label. It updates in real time. |
| L3 | As a player, I click **Quick Match** to be placed in a ranked game. | P1 | I'm seated at an open ranked table or a new one is created. The game starts automatically when 4 players are seated. The host can start early with 3. |
| L4 | As a host, I choose Ranked or Casual. | P0 | Ranked is available only during the qualifier window and only when 3 or more players are seated at start. Otherwise the game is Casual. The label is shown to everyone before the start. |
| L5 | As a player, I leave a table before it starts without penalty. | P0 | My seat frees up. If the host leaves, the host role passes to the next seated player. Tables with no players are removed. |

### 5.3 Gameplay

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| G1 | As a player, I play Uno by the official rules. | P0 | The rules match [game-engine.md](engineering/game-engine.md). Illegal moves can't be made: unplayable cards are dimmed, and the server rejects any illegal move that gets through. |
| G2 | As a player, I always know whose turn it is and what I can do. | P0 | The current player is highlighted, direction is shown, and the top card and current color are prominent. Every opponent's card count is visible. My playable cards are highlighted. |
| G3 | As a player, I have 30 seconds per turn. | P0 | A countdown is visible. When it runs out, the server acts for me: it draws 1 card and passes, or picks a color if I was choosing one. After 3 timeouts in a row, I'm marked **Away** and my turns time out after 5 seconds until I act again. |
| G4 | As a player, I call "UNO!" and catch others who forget. | P0 | Playing my second-to-last card lets me call UNO in the same action. If someone reaches one card without calling UNO, opponents see a **Catch!** button until the next player acts. A successful catch makes the offender draw 2. |
| G5 | As a player, I can reconnect if my browser refreshes or Wi-Fi drops. | P0 | When I reload, I return to my game with my hand intact. The game continues without me while I'm gone, with timeouts applied. |
| G6 | As a player, I can play comfortably on my phone. | P0 | The layout works on screens 360px wide and up, in portrait. Touch targets are at least 44px. |
| G7 | As a player, I see the result at the end. | P0 | The results screen shows placements and points earned (ranked games), with buttons to rematch or return to the lobby. |
| G8 | As a player, I can leave a game in progress. | P0 | I'm asked to confirm. Leaving is a forfeit: I get last place, and my cards go back into the deck. |
| G9 | As a colorblind player, I can tell cards apart. | P0 | Every card shows a color-specific symbol or pattern as well as its color. Current-color indicators include a text label. |
| G10 | Card plays feel responsive and animated. | P1 | My card animates right away when I play it, and it snaps back with a message if the server rejects the move. |
| G11 | Sound effects, with a mute toggle. | P2 | |

### 5.4 Qualifiers and leaderboard

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| Q1 | As a player, ranked games earn placement points. | P0 | Points follow [tournament.md](engineering/tournament.md) (4 players: 10/6/3/1; 3 players: 8/4/1). They're recorded automatically when the game ends. |
| Q2 | As a player, I see the live leaderboard. | P0 | It shows rank, name, avatar, qualifier score, ranked games played, wins, and an "Eligible" badge. It updates in real time. My own row is highlighted. |
| Q3 | As a player, I know what I need to qualify. | P0 | My profile shows my score, how many of my games count toward it (best 10), the 3-game minimum, and my current projected seed. |
| Q4 | Grinding doesn't win. | P0 | Only a player's best 10 ranked results count toward their score. |
| Q5 | Collusion is limited. | P1 | If the exact same group of players plays more than 2 ranked games together in a day, later games that day are Casual. The lobby warns before the game starts. |
| Q6 | As a player, I see my game history. | P1 | A list of my recent games with date, opponents, placement, and points. |

### 5.5 Event-day bracket

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| B1 | As an admin, I generate the bracket from the leaderboard. | P0 | One click seeds the top N eligible and attending players (default 16) into 4-player tables using snake seeding. I can preview it before it's saved. |
| B2 | As an admin, I adjust the bracket before locking it. | P0 | I can swap players, remove a no-show (the next eligible player is pulled in), and reseed. Once I lock it, it can only be changed through admin overrides. |
| B3 | As a bracket player, I know where to play. | P0 | When my match is ready, my home screen shows a banner ("Round 1 — Table B — Join now"). Seats are fixed; I can't join other bracket tables as a player. |
| B4 | Matches start when everyone is present. | P0 | Each seated player taps **I'm here** to check in. The game starts automatically once all have checked in, or when an admin force-starts it. A player who is still absent then plays under the timeout rules. |
| B5 | Results advance automatically. | P0 | When a table finishes, the top 2 advance to their next-round slots. A round's next tables become available as soon as their players are known. |
| B6 | The final is a best-of-three. | P1 | The final table plays 3 games. Standings are by total placement points. Ties are broken by number of wins, then by the placement in the last game. |
| B7 | Spectators follow along on a big screen. | P0 | A `/tv` route shows the full bracket, each table's live status (current player, card counts), and a champion banner at the end. It's readable from 5 meters on a 1080p screen and needs no interaction. |
| B8 | Spectators watch a specific table. | P1 | Selecting a table shows the public game view: top card, card counts, and turn. Hands are never shown. |

### 5.6 Admin tools

| ID | Story | Priority | Acceptance criteria |
|---|---|---|---|
| AD1 | As an admin, I set the qualifier window. | P0 | I can set the start and end times. Ranked games can start only inside the window. |
| AD2 | As an admin, I manage players. | P0 | I see all users with their attending status and eligibility. I can edit a display name (to handle inappropriate names) and toggle attendance. |
| AD3 | As an admin, I void a game. | P0 | A voided game's results are removed from the leaderboard, and the leaderboard recomputes. |
| AD4 | As an admin, I override a bracket result. | P0 | I can manually set a table's placements, for example after a crash. The bracket advances from the corrected result. Every override is logged with admin, time, and reason. |
| AD5 | As an admin, I force-start or restart a bracket game. | P0 | Force-start begins the game with whoever is present. Restart voids the current game and creates a new one with the same seats. |

## 6. Game rules configuration

The MVP uses **official Uno rules** with these explicit choices (details in [game-engine.md](engineering/game-engine.md)):

- 7-card deal. 108-card deck.
- A player may draw even when they hold a playable card. If the drawn card is playable, they can play it right away.
- **Stacking: off.** 7-0 swap: off. Jump-in: off.
- **Wild Draw 4 legality is enforced by the server.** A player can play it only when they hold no card matching the current color. This replaces the official "challenge" mechanic, since the server knows every hand.
- The game ends when the first player empties their hand. Other players are ranked by fewest cards left, then by lowest card-point value.

The engine reads house rules from a `rules` config object, so they can be added later without changing its structure.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Scale** | Under 50 registered users, up to about 12 tables at once (about 48 concurrent players) |
| **Latency** | Under 500ms at p95 from a move to the update showing for all players on office Wi-Fi |
| **Availability** | During the qualifier window: best effort. On event day, the function instances that handle moves are kept warm and the team is on call. |
| **Browsers** | Latest Chrome, Edge, Safari, and Firefox; iOS Safari 16+; Android Chrome |
| **Accessibility** | WCAG 2.1 AA color contrast. Card designs are colorblind-safe. Play works by keyboard on desktop. |
| **Security** | Server-authoritative game logic. Players can't see others' hands or the deck through any API or database read. Access requires a verified company domain. |
| **Privacy** | Stores only work email, display name, avatar choice, attendance flag, and game records. No analytics SDKs beyond Firebase defaults. Data is deleted within 90 days after the event unless we decide to keep it. |
| **Cost** | Firebase Blaze plan, expected to cost under $5/month. A budget alert is set at $25. |

## 8. Success metrics

| Metric | Target |
|---|---|
| Invited employees who register | ≥ 70% |
| Players who play at least 1 ranked game | ≥ 40 people, or ≥ 60% of registered players |
| Total ranked games during qualifiers | ≥ 150 |
| Event-day incidents that block the bracket | 0 |
| Admin manual overrides on event day | ≤ 2 |
| Post-event survey: "The Uno tournament helped me connect with coworkers" | ≥ 4 / 5 average |

## 9. Out of scope (candidates for later)

- House rules (stacking, 7-0, jump-in), team or doubles play
- Chat and emoji reactions
- Playing against a bot to practice
- Season archives and multiple seasons
- Microsoft 365 SSO, if magic links prove unreliable

## 10. Open questions (need sign-off)

| # | Question | Owner | Proposed default |
|---|---|---|---|
| 1 | What is the confirmed event date and time block? | Events | Week of Nov 2, 2-hour block |
| 2 | How many players make the bracket? | Events | 16 (3 rounds, about 60–75 min) |
| 3 | Can remote employees play qualifiers even though they can't attend? | Events | Yes, they appear on the leaderboard. Only attending players are seeded. |
| 4 | Prizes, and who awards them? | Events | Handled outside the app |
| 5 | Who are the admins? | Events | Brian plus 1–2 organizers |
| 6 | Name and branding. "UNO" is a Mattel trademark. Is "Nue Uno" acceptable for an internal-only event, or should we use a different name (for example "NUE-NO!")? Either way we'll use original card art. | Marketing / Legal | Internal only, original art. Confirm the name. |
| 7 | Will IT allowlist Firebase sign-in emails so M365 doesn't quarantine them or Safe Links doesn't rewrite them? | IT | Test in Week 1 |
| 8 | Should game data be kept after the event (for a hall of fame, for example)? | Events | Delete after 90 days |
