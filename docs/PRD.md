# Nue Uno — Product Requirements Document (v2)

| | |
|---|---|
| **Owner** | Brian Acquisto |
| **Status** | v2 draft for stakeholder review. It replaces v1; see the [v1 review](reviews/PRD-v1-review.md) and [changelog](#17-changelog). |
| **Last updated** | 2026-09-23 |
| **Target event** | Connections event, in office, week of Nov 2, 2026 (date TBD) |
| **Companion docs** | [Experience & Motion spec](design/experience-and-motion.md) · [Engineering docs](engineering/) |

---

## 1. Summary

Nue Uno is an internal web app where NueSynergy employees play fast, polished Uno in the browser. Over several weeks it builds up to a **live tournament at the Connections event**:

1. **Qualifiers (online, about 2.5 weeks).** Players play ranked games whenever they like, and especially during scheduled **Uno Hours**. They earn points, collect **Connection Passport** stamps for each new coworker they play, and help their department in the **Department Cup**.
2. **Selection Show (event morning).** The seeded bracket is revealed on the big screen, one player at a time.
3. **Event bracket (in office).** The top qualifiers play the bracket on their phones while sitting at real tables. Everyone else makes **Pick'em** predictions, sends **reactions** that float up on the TV, and plays casual games at open tables.
4. **Uno Wrapped (after the event).** Every player gets a personal recap card, and the event ends with superlative awards.

**North star:** people leave having played Uno with coworkers they'd never met, and they talk about how good the game looked and felt.

## 2. Goals, non-goals, and experience principles

### Goals
| # | Goal | How we'll know (see §13) |
|---|---|---|
| G1 | **Connection.** People play with coworkers outside their own team. | Unique cross-department pairs. Average number of distinct coworkers each player plays with. |
| G2 | **Fair competition.** Seeding people trust, with no grinding or collusion. | Zero upheld fairness complaints |
| G3 | **A smooth event day.** The bracket finishes on time without manual bookkeeping. | Bracket fits its time slot. At most 2 manual overrides. |
| G4 | **Everyone takes part.** Something for people who aren't in the bracket. | Share of attendees who submit Pick'em picks or send reactions |
| G5 | **Impressive quality.** It looks and feels better than people expect from an internal tool. | Survey: "The game looked and felt great" averages 4.5/5 or higher |
| G6 | **Easy to start.** From the email link to your first card played in under 3 minutes. | Median time to first game |

### Non-goals
- Public or external access. Real-money prizes or wagering in the app.
- Native apps. The app is an installable web app (PWA).
- Free-text chat. Players can only send fixed emotes, so no moderation is needed.
- House-rule variants (stacking, 7-0, jump-in). They're designed for but not built.
- Bots in ranked or bracket games. Bots are only for practice and the tutorial.

### Experience principles
1. **Every action gets visible feedback.** Each play, draw, and effect has a clear visual response. Nothing just silently changes on screen.
2. **Animations never cost the player time.** Turn timers start only after animations finish, and effects never block your next action.
3. **The room sees what the phone sees.** Big moments on a player's phone also show up on the TV.
4. **Loud when it matters, calm otherwise.** Big effects are saved for big moments (Wild Draw 4, UNO!, winning a game). Everyday moves stay crisp and quick.
5. **Everyone can play.** Colorblind-safe cards, reduced-motion support, sound off by default, full keyboard play.

## 3. Personas

| Persona | Description | Primary needs |
|---|---|---|
| **Competitor** | Wants to qualify and win. Checks the leaderboard daily. | Clear standing, fair rules, a snappy game |
| **Casual Connector** | Plays a few games, mostly to socialize. May not know the official rules. | Easy onboarding, friendly help with rules, emotes, fun effects |
| **Remote Player** | Can play qualifiers but can't attend the event in person | A way to take part (leaderboard, Department Cup, Wrapped). Clear communication that seeding requires attending. |
| **The Crowd** | People at the event who aren't in the bracket, holding their phones | Something to do: Pick'em, reactions, open tables, following the TV |
| **Tournament Admin** | 1–3 organizers | Mission Control, fast fixes, pause and broadcast, a paper fallback |
| **MC** | The person on the mic at the event | TV cues, a run-of-show, knowing when to announce what |

## 4. Tournament lifecycle and timeline

```
 Launch  ──►  Qualifiers + Uno Hours  ──►  Selection Show  ──►  Live Bracket  ──►  Awards  ──►  Uno Wrapped
 (teaser,      (ranked play, Passport,       (seed reveal        (+ Pick'em,       (champion,     (personal
  sign-up)      Dept Cup, Teams digests)      on the TV)          reactions)        superlatives)   recap cards)
```

| Phase | Target dates (tentative) | What's live |
|---|---|---|
| Teaser and sign-up | Oct 8 – Oct 13 | Teaser video, posters with QR codes, sign-up, tutorial, practice vs. bots, casual tables |
| **Qualifiers** | Oct 14 – Oct 30 | Ranked play, leaderboard, Passport, Department Cup, daily Uno Hours (12:00–12:45 and 16:00–16:30 local time), daily Teams digest |
| Blackout (P2) | Oct 29 – 30 | The top of the leaderboard is hidden to build suspense. Players still see their own standing. |
| Seeding lock | Oct 30, end of day | Ranked play closes. The draft bracket is generated privately. |
| **Event day** | Week of Nov 2 (TBD) | Selection Show → Round 1 → Semis → Final → Awards. Pick'em, reactions, and open tables run throughout. |
| Wrapped | Event + 1 week | Uno Wrapped cards, hall of fame |

Scoring details are in [tournament.md](engineering/tournament.md).

## 5. Requirements

**Priority:** **P0** = must ship for the event. **P1** = should ship, and is the first thing cut if P0 slips. **P2** = stretch goal. The cut line is in §14.

### 5.1 Access, identity, and profile (A)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| A1 | Sign in with a magic link to my work email | P0 | Entering an email sends a link. Opening it on the same device signs me in. On a different device, I confirm my email first. I stay signed in across restarts. |
| A2 | Only employees can get in | P0 | Only `@nuesynergy.com` addresses are accepted. The UI, database rules, and server all enforce this (see [architecture ADR-3](engineering/architecture.md#adr-3-email-link-auth-restricted-to-the-company-domain)). |
| A3 | Only real people can get in (roster) | P1 | An admin imports the HR roster CSV (email, name, department). Anyone who signs in with an address not on the roster, such as a shared mailbox, sees "Waiting for approval" until an admin approves them. |
| A4 | Set up my identity in under 30 seconds | P0 | First-run setup asks for a display name (prefilled from the roster or email) and an avatar (12 presets). It also asks for **department** (prefilled from the roster, otherwise picked from a list) and "I'll be at the in-office event" (yes / no / not sure). |
| A5 | Personalize my profile | P1 | I can choose an avatar **color** and a **signature card**, which shows on my intro card. Frames and card backs I've unlocked (see C3) can be equipped. |
| A6 | Control effects and sound | P0 | Settings: Effects Full / Reduced / Off (default Full, or Reduced if the OS asks for reduced motion). Sound on / off (**default off**). Haptics on / off. |
| A7 | Sign out | P0 | |

### 5.2 Onboarding and learning (O)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| O1 | Rules at a glance | P0 | A rules page and an in-game "?" sheet explain every card and **point out the rules people often get wrong**: no stacking, you may draw even when you could play, the Wild Draw 4 restriction, calling UNO, and Final Lap. |
| O2 | Interactive tutorial | P1 | A 2-minute guided game against scripted bots covers matching, action cards, Wild, drawing, and calling UNO. It's offered after first-run setup and can be skipped. Finishing it earns a Passport stamp. |
| O3 | Practice against bots | P1 | Start a casual game against 1–3 bots whenever I want. Bots play sensibly, take 1–2 seconds per move, and never appear in ranked or bracket games. |
| O4 | Hints in the moment | P0 | Playable cards lift and glow. When I try something illegal, I get a friendly explanation ("You can only play Wild Draw 4 when you have no red cards"). |

### 5.3 Lobby and getting enough players (L)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| L1 | Create a table and invite others | P0 | A 2–4 seat table with a share link (`/t/{id}`) and a QR code. The host starts once 2 or more have joined. |
| L2 | Browse open tables | P0 | A live list with host, seats filled, Ranked/Casual label, and the departments at the table |
| L3 | Quick Match | P0 | Seats me at an open ranked table, **preferring tables with coworkers I haven't played yet**. Starts automatically at 4 players. The host can start at 3. |
| L4 | Ranked vs. casual | P0 | Ranked only inside the qualifier window with 3 or more people. The anti-collusion rules apply (§6). The label is visible before the game starts. |
| L5 | Know when people are playing | P0 | The lobby shows a countdown to the **next Uno Hour** (it glows while one is live) and a count of games played today. |
| L6 | See who's online | P1 | An "Online now" row of avatars (presence). Tapping one lets me invite them to my table. |
| L7 | "Table forming" nudges | P1 | When a ranked table needs 1 more player, everyone online and not in a game sees a toast with **Join**. Limited to one toast per person every 2 minutes. |
| L8 | Leave before the start without penalty | P0 | The seat frees up and the host role passes to the next player. Empty tables are removed. |
| L9 | Rematch | P1 | After a game, **Rematch** creates a new table with the same players. Each player must confirm, and the anti-collusion rules still apply. |

### 5.4 Core gameplay (G)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| G1 | Official rules, enforced by the server | P0 | See §6 and [game-engine.md](engineering/game-engine.md). Illegal moves are impossible, and nothing hidden reaches the client. |
| G2 | Always clear whose turn it is and what I can do | P0 | A timer ring on the current player's avatar, a direction indicator, a large top card, and the current color shown in the **background tint** plus a text label. My playable cards are lifted. Every opponent's card count is visible. |
| G3 | Fair turn timer | P0 | 30s in casual and qualifiers, 20s in the bracket. The countdown starts **after** the previous move's animation finishes (server deadline = turn length + 1.5s grace). On timeout: draw and pass, or pick a color automatically. After 3 timeouts in a row the player is marked **Away** and gets 5-second turns. |
| G4 | UNO! call and catch | P0 | Playing my second-to-last card shows a big **UNO!** button, and I can call it along with the play. If someone forgets, opponents see a **Catch!** button until the next player acts. A successful catch makes the offender draw 2. |
| G5 | Final Lap time cap | P0 | Qualifier games are capped at 20 min and bracket games at 12 min. When the cap hits, a **FINAL LAP** banner appears and every player gets exactly one more turn. Then placements are decided by fewest cards, then lowest hand value. A player who empties their hand during the Final Lap wins immediately. |
| G6 | Reconnect without losing anything | P0 | Reloading returns me to my game. A "Reconnecting…" pill shows while offline. Opponents see a disconnected icon on my avatar. |
| G7 | Great on phones | P0 | Works at 360px wide and up in portrait. Touch targets at least 44px. **Tap or drag** a card to play. One-thumb controls. |
| G8 | Keyboard play on desktop | P0 | ←/→ to choose a card, Enter to play, D to draw, U to call UNO, 1–4 to pick a color |
| G9 | Colorblind-safe | P0 | Each color has its own shape (red ◆, yellow ●, green ▲, blue ■) on the card and in the color indicators |
| G10 | Leave (forfeit) | P0 | I confirm first. I get last place, and my cards are shuffled back into the deck. |
| G11 | Results screen | P0 | An animated podium showing placements, points earned, Passport stamps earned, and Rematch / Lobby buttons |
| G12 | Emotes | P1 | 8 fixed emotes (👏 Nice · 😂 · 😱 · 🔥 · 🙏 GG · 😈 Sorry-not-sorry · 👀 · 🫡). One every 3 seconds per player. They appear as bubbles from the sender's avatar. Players can mute emotes for a game. |
| G13 | Screen-reader play-by-play | P1 | An ARIA live region announces each event ("Dana played Red 7. Your turn."). |

### 5.5 Experience and effects (X)

These are summarized here. The full timing, easing, sound, and fallback details are in the [Experience & Motion spec](design/experience-and-motion.md).

| ID | Moment | Pri | What the player experiences |
|---|---|---|---|
| X1 | **The Deal** | P0 | Cards fly from the deck to each seat one at a time, in a fan, then my hand flips face-up with a ripple |
| X2 | **Hand fan** | P0 | My hand fans out in an arc. Playable cards lift and glow slightly. The selected card rises and tilts. |
| X3 | **Throw** | P0 | A played card follows a curved path to the pile and lands at a slight random angle (a messy, realistic pile), with a small dust puff |
| X4 | **Draw flip** | P0 | A drawn card slides from the deck and flips over in 3D into my hand. Opponents see a face-down card slide to that player. |
| X5 | **Color shift** | P0 | When a Wild is played, a color wheel bursts open and the background tint sweeps to the chosen color |
| X6 | **Action stamps** | P0 | Skip: a 🚫 stamp slams onto the victim's avatar. Reverse: the direction ring spins with a whoosh. Draw 2: a "+2" stamp, with cards flying to the victim. |
| X7 | **Wild Draw 4 impact** | P0 | The card slams down in slow motion, the screen shakes, and an impact ripple spreads out. A big "+4" hits the victim, whose avatar flinches, and 4 cards fly to them. |
| X8 | **UNO!** | P0 | A large "UNO!" burst with a sparkle ring on the caller's avatar. Their seat pulses gold while they hold 1 card. |
| X9 | **Caught!** | P0 | A "CAUGHT!" stamp with a red siren flash on the offender, and the catcher's avatar gets a 🎯 badge |
| X10 | **Turn ring and heartbeat** | P0 | A timer ring around the current player's avatar. In the last 5 seconds it pulses red, and on Android the phone vibrates. |
| X11 | **Final Lap** | P0 | A checkered-flag banner sweeps across the screen, the timer ring turns checkered, and a "last turn" chip appears on each player |
| X12 | **Victory** | P0 | The winning card plays in slow motion, then a confetti burst, and the podium rises (1st, 2nd, 3rd). Points count up. |
| X13 | **Leaderboard motion** | P0 | Rows slide to their new ranks, with ▲/▼ chips. A 🔥 streak flame appears after 3 ranked wins in a row. A gold shimmer marks the Top 16 cut line. |
| X14 | **New Connection!** | P1 | At the start of a game, a passport stamp lands next to anyone I've never played before ("New connection: Priya · Finance") |
| X15 | **Sound design** | P1 | A soft, tactile sound set (card snaps, shuffles, stamps, crowd "ooh" on +4), with a separate sound set for the TV. Off by default on phones. |
| X16 | **Ambient table** | P1 | A dark "arcade felt" table with a subtle vignette and a slow light sweep. The tint follows the current color. |
| X17 | **Performance-aware effects** | P0 | Effects scale down automatically if the frame rate drops (§11). Reduced mode swaps motion for fades. Off mode swaps it for instant changes. |

### 5.6 Connections (C)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| C1 | **Connection Passport** | P1 | My passport shows a stamp for each distinct coworker I've played (any human game) and for each department. Bots don't count. Milestones at 5, 10, and 20 coworkers and at every department. |
| C2 | See who I haven't met | P1 | "People you haven't played yet" suggestions in the lobby, filtered to who is online |
| C3 | Cosmetic unlocks | P2 | Passport milestones unlock card backs and avatar frames. They're purely cosmetic and give no competitive advantage. |
| C4 | **Department Cup** | P1 | A department leaderboard. Score = the sum of the department's **top 3** members' qualifier scores, plus **2 points per member with 3 or more ranked games**, which rewards participation. Shown on the leaderboard page and the TV. |
| C5 | Connector award | P1 | Whoever has the most distinct opponents at seeding lock gets the "Connector" superlative at the event. |

### 5.7 Qualifiers and leaderboard (Q)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| Q1 | Ranked placement points | P0 | 4 players: 10/6/3/1. 3 players: 8/4/1. Recorded automatically (see [tournament.md](engineering/tournament.md)). |
| Q2 | Live leaderboard | P0 | Rank, avatar, name, department, score, games played, wins, an Eligible badge, a Top 16 cut line, and my own row highlighted and pinned. It moves live (X13). |
| Q3 | Know my path to the bracket | P0 | A "My Qualifier" card shows my score, the games counted in it (best 10), whether I've played the 3-game minimum, my projected seed, and **points needed to reach the cut line**. |
| Q4 | Grinding doesn't win | P0 | Only a player's best 10 results count |
| Q5 | Collusion is limited | P0 | The same group of players gets at most 2 ranked games per day together. Ranked points are awarded only if the game reaches **12 or more turns**. A forfeiting player still gets their last-place result. |
| Q6 | Local times | P0 | The qualifier window and Uno Hours are shown in my local time zone, with a countdown |
| Q7 | Game history | P1 | Recent games with opponents, placement, points, and stamps earned |
| Q8 | Leaderboard blackout | P2 | For the final 24 hours, the top 20 positions are hidden ("???"). I still see my own rank. Everything is revealed at the Selection Show. |

### 5.8 Event day: bracket, TV, and crowd (E)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| E1 | Generate, adjust, and lock the bracket | P0 | Top N eligible and attending players (default 16), snake-seeded into tables of 4. The admin can swap players or replace no-shows before locking. |
| E2 | **Event Hub home screen** | P0 | While the season is in event mode, my home screen shows my match (table, seat, status), the bracket, Pick'em, and open casual tables |
| E3 | Check in with a QR code at the physical table | P0 | Each physical table has a printed sign ("TABLE B") with a QR code. Scanning it opens that match and checks me in. An **I'm here** button does the same thing. The game starts automatically when every player has checked in. |
| E4 | Automatic advancement | P0 | Top 2 at each table advance. The next table becomes ready as soon as its players are known. |
| E5 | Final: best of 3 | P0 | Ranked by total placement points, then wins, then placement in game 3 |
| E6 | **TV: live bracket board** | P0 | `/tv` at 1080p and 4K. It shows the bracket with animated advancement lines, a live tile for each table (current player, card counts, a stamp when a +4 is played), a ticker of events from across tables ("Marcus hit Dana with a +4 at Table B"), a countdown between rounds, and a QR code to open the app. It runs with no interaction. |
| E7 | **TV: champion ceremony** | P0 | A full-screen spotlight on the champion's avatar and name, fireworks and confetti, final standings, and a gold frame on the bracket |
| E8 | **TV: player intros** | P1 | Before each table starts, walk-out cards appear for each player: avatar, seed, department, qualifier record, and signature card |
| E9 | **Selection Show** | P1 | An admin-triggered reveal on the TV. Seeds are revealed from 16 down to 1 with a drumroll and a card flip, then the full bracket assembles itself. Players' phones buzz "You're in! Seed 7, Table C." |
| E10 | **Pick'em predictions** | P1 | Anyone can pick who wins each table. Picks lock when that table's game starts. Scoring: 3 points per correct table winner, 10 points for picking the champion before Round 1. There's a live Pick'em leaderboard, shown on the TV between rounds. |
| E11 | **Crowd reactions** | P1 | Anyone following a table or the bracket can tap 🔥 👏 😱 🎉. Reactions float up on the TV next to that table. Limited to 1 per second per person. The TV totals them. |
| E12 | Watch a table on my phone | P1 | The public game view: top card, card counts, effects, and emotes. Hands are never shown. |
| E13 | Open tables during the event | P0 | Casual play and practice stay available to everyone during the event, and aren't blocked by event mode |
| E14 | **Awards ceremony** | P1 | After the final, the TV shows superlatives computed from the data: Champion, Connector, Draw-4 Dealer (most +4s played), Comeback Kid (won after holding the most cards), Sharpshooter (most UNO catches), Iron Player (most games), Department Cup winner |
| E15 | Final table broadcast | P2 | An optional TV mode that reveals the final-table hands to the crowd, poker-style. It can only be turned on by an admin, and only if the players can't see the screen. |
| E16 | Instant replay | P2 | The TV replays the last 5 events of each table's winning moment in slow motion |

### 5.9 Admin and Mission Control (AD)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| AD1 | Season settings | P0 | Qualifier window, Uno Hours schedule, bracket size, timers, Final Lap caps, and switching season status (setup, qualifying, locked, event, complete) |
| AD2 | Manage players | P0 | Search, edit display name, toggle attendance, set department, approve pending users (A3), disable an account |
| AD3 | Void a game | P0 | Recomputes the leaderboard, Passport, and Cup |
| AD4 | Override or restart a bracket match | P0 | Enter placements manually (logged with a reason), or void the game and restart it with the same seats |
| AD5 | **Mission Control** | P0 | A live grid of every table showing state, turn, time since the last move, and disconnected players. Alerts for a table stuck in *ready* for more than 3 minutes, no moves for more than 90 seconds, or a player disconnected for more than 60 seconds. Force-start, restart, and override are one click away. |
| AD6 | **Pause all / resume** | P1 | Freezes every bracket game's timer (shown as "PAUSED" on all screens and the TV). Resume restores each player's remaining time. |
| AD7 | **Broadcast** | P1 | Push a banner to every client and the TV ("Round 2 starts in 5 minutes"). Optional presets for the MC. |
| AD8 | TV director controls | P1 | Switch the TV between Bracket, Pick'em standings, Department Cup, Selection Show, Awards, and Champion scenes. Choose a table to feature. |
| AD9 | Printable bracket and paper fallback | P1 | A print-friendly bracket and score sheets. Results from a paper game can be entered with AD4. |
| AD10 | Stats | P1 | Registrations vs. roster, daily active players, ranked games per day, cross-department pairs, Pick'em participation (the metrics in §13) |

### 5.10 Notifications and comms (N)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| N1 | Installable app | P1 | A PWA manifest and icons, so the app can be added to the home screen and opens full-screen without browser bars |
| N2 | **Teams channel posts** | P1 | Posted through a Teams Workflows webhook: a daily 9:00 leaderboard and Cup digest, "Uno Hour starts now", "New #1!" moments, bracket results on event day. Admins can turn each type on or off. |
| N3 | In-app match callouts | P0 | On event day, a full-screen "Your table is ready — Table C" takeover with vibration, plus the player's name called out on the TV |
| N4 | Web push | P2 | "Your table is ready" and "Table forming" notifications on Android and desktop, and on iOS if the app has been added to the home screen |

### 5.11 Recap (R)

| ID | Story | Pri | Acceptance criteria |
|---|---|---|---|
| R1 | **Uno Wrapped** | P1 (may ship after the event) | A personal animated story of 5–7 cards: games played, coworkers met, departments stamped, favorite victim (+4s dealt to one person), most-played card, best finish, and a final shareable summary card saved as a PNG |
| R2 | Hall of fame | P1 | A permanent page with the champion, final table, award winners, and Department Cup winner |

## 6. Game rules configuration

Official Uno rules with these choices (details in [game-engine.md](engineering/game-engine.md)):

- 108-card deck and a 7-card deal. You may draw even when you could play, and you may play the drawn card if it's playable.
- **No stacking.** No 7-0 swaps. No jump-in.
- **Wild Draw 4 legality is enforced by the server** (you can only play it when you hold no card of the current color), so there's no challenge step.
- The game ends when someone empties their hand, or after the Final Lap (G5). Placement order: winner, then fewest cards, then lowest hand point value, then seat distance from the winner.
- **Ranked integrity:** a game must reach 12 or more turns to award points. The same group of players gets at most 2 ranked games per day. Leaving a game counts as a last-place finish.
- **Timers:** 30s in casual and qualifier games, 20s in bracket games, plus 1.5s of animation grace. Away players get 5s turns. The Final Lap cap is 20 min in qualifiers and 12 min in the bracket.

## 7. Event run-of-show (default: 16-player bracket, 2-hour block)

| Time | Segment | TV scene | Notes |
|---|---|---|---|
| T–15 | Doors open. Scan the QR code on the TV and open the app. | Bracket teaser + QR code | Pick'em opens |
| T+0 | **Selection Show** (about 8 min) | Selection Show | Seeds 16 down to 1, the bracket assembles, phones buzz |
| T+10 | Round 1: 4 tables, 12 min cap | Bracket board + live tiles + ticker | Player intros as each table checks in |
| T+25 | Break (5 min) | Pick'em standings + Department Cup | Round 1 results |
| T+30 | Semifinals: 2 tables, 12 min cap | Bracket board | |
| T+45 | Break (5 min) | Pick'em standings | Final table intros |
| T+50 | **Final**: best of 3, 12 min cap per game | Featured table (optional hand reveal, P2) | |
| T+90 | **Awards and champion** | Awards → Champion | Superlatives, Department Cup, Pick'em winner |
| T+100 | Open play | Bracket (gold) | Open casual tables for everyone |

The whole bracket is bounded by the Final Lap caps and fits within 100 minutes.

## 8. Visual direction and brand

- **Mood:** a late-night game table. Dark, rich, and polished, with bursts of color from the cards. Think of a premium arcade card game, not a corporate dashboard.
- **Table:** deep navy-to-teal felt gradient with subtle grain and a vignette. The ambient tint follows the current color.
- **Cards:** original art. Rounded corners, bold numbers, a shape symbol for each color (colorblind-safe), and a slight sheen when a card moves. Colors are tuned for WCAG AA contrast on the dark table.
- **Nue Wild:** a custom Wild card design built around the NueSynergy mark. It's the card people will remember.
- **Card back:** NueSynergy branded, with unlockable variants (C3).
- **Typography:** a chunky rounded display face for callouts (UNO!, +4, FINAL LAP) and a clean sans-serif for the rest of the interface.
- **Brand:** NueSynergy brand colors for navigation, buttons, and the TV frame. Brand guidelines come from Marketing (open question 9).

## 9. Accessibility

WCAG 2.1 AA contrast. Colorblind-safe symbols on cards and color indicators (G9). Full keyboard play (G8). Screen-reader play-by-play (G13). Respects `prefers-reduced-motion` with Reduced and Off effect modes (A6). No flashing more than 3 times per second, including screen shake and siren effects. Sound is never the only signal for anything.

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Scale | Under 60 users. Up to 12 tables at once, plus the TV, plus about 40 spectators. |
| Latency | Under 500ms at p95 from a move to it showing for all players on office Wi-Fi |
| Browsers | Latest Chrome, Edge, Safari, and Firefox. iOS Safari 16+. Android Chrome. TV: Chrome on a laptop driving a 1080p or 4K display. |
| Availability | Best effort during qualifiers. On event day, move-handling server instances are kept warm, the team is on call, and there's a paper fallback (AD9). |
| Security | Moves are validated by the server. No hidden information is sent to clients. Company domain plus roster checks. Every admin action is logged. |
| Privacy | Stores work email, name, department, avatar and settings, attendance, and game records. No third-party analytics. Retention is set by open question 8. The roster is never committed to the repo. |
| Cost | Firebase Blaze plan, expected under $10/month. Budget alert at $25. |

## 11. Performance budget (for the effects)

| Budget | Target |
|---|---|
| Frame rate | 60fps during card animations on an iPhone 12 or Pixel 6a class phone. 30fps is the floor on older devices. |
| Adaptive quality | If the average frame rate is under 45 for 2 seconds, drop to Reduced effects for the session and show a small notice |
| Initial load | Lobby JavaScript ≤ 250 KB gzipped. The game, TV, effects, and sounds load when needed. Largest contentful paint under 2.5s on 4G. |
| Animation technique | Animate only `transform` and `opacity`. Confetti and particles are capped at 150 on phones and 600 on the TV. |
| Audio | Sounds combined into one sprite file, ≤ 400 KB, loaded only after sound is turned on |
| Effect timing | Everyday effects ≤ 400ms. Signature effects ≤ 1200ms. Effects never block input, and if events pile up, the queue skips ahead to the latest state (see the motion spec). |

## 12. Launch and comms plan

| When | What | Owner |
|---|---|---|
| Oct 6 | Brand and name sign-off. Nue Wild card art final. | Marketing |
| Oct 8 | **Teaser video** (about 30s, motion graphics of the Nue Wild and the gameplay effects) plus posters with QR codes in the office | Marketing + Eng |
| Oct 8 | Announcement email: what it is, how to join, key dates, "practice now" | Events |
| Oct 14 | Qualifiers open. A kickoff Uno Hour with organizers playing. | Events |
| Daily | Teams digest (N2). Uno Hours. | Automated |
| Oct 27 | "Final week" push, Department Cup standings, attendance confirmation | Events |
| Oct 31 | Private email to bracket qualifiers: "You're in the running, be there for the Selection Show" | Events |
| Event + 1 wk | Uno Wrapped goes live. Recap post with highlights. Survey. | Eng + Events |

## 13. Success metrics and instrumentation

All metrics come from Firestore data (no third-party analytics) and appear on the admin **Stats** page (AD10).

| Metric | Target | Source |
|---|---|---|
| Registered / roster size | ≥ 70% | `users` vs. `roster` |
| Players with at least 1 ranked game | ≥ 60% of registered | `results` |
| Ranked games during qualifiers | ≥ 150 | `results` |
| **Average distinct coworkers played per player** | ≥ 6 | Passport |
| **Share of game pairings that are cross-department** | ≥ 50% | Passport |
| Median time from sign-in to first card played | < 3 min | `users.createdAt` → first game event |
| Event attendees who used Pick'em or reactions | ≥ 60% | `picks`, `reactions` |
| Bracket finishes within its time slot | Yes | Run-of-show |
| Manual admin overrides on event day | ≤ 2 | `auditLog` |
| Survey: "helped me connect with coworkers" / "looked and felt great" | ≥ 4.0 / ≥ 4.5 out of 5 | Survey |

## 14. Scope and cut line

About 5 weeks with 1–2 engineers. P0 is sized to fit. **The effects budget is about 5 build-days**, spread over Weeks 2–4 and covered by the P0 X-stories.

| Tier | Contents |
|---|---|
| **P0: must ship** | Auth and profile, rules and hints, lobby, Quick Match, Uno Hours countdown, full gameplay including Final Lap and the fair timer, **signature effects X1–X13 and X17**, leaderboard, ranked integrity, bracket with QR check-in, Event Hub, **TV board and champion ceremony**, Mission Control, match callouts, open tables |
| **P1: should ship** (cut from the bottom up) | Sound (X15), Pick'em (E10), crowd reactions (E11), Selection Show (E9), emotes (G12), Passport and Department Cup (C1, C2, C4, C5), pause and broadcast (AD6, AD7), TV director (AD8), awards (E14), player intros (E8), presence and nudges (L6, L7), Teams posts (N2), tutorial and bots (O2, O3), PWA (N1), roster (A3), printable bracket (AD9), stats (AD10), rematch (L9), history (Q7), New Connection stamp (X14), ambient table (X16), screen reader (G13), personalization (A5), watching a table (E12), Wrapped and hall of fame (R1, R2) |
| **P2: stretch** | Cosmetic unlocks (C3), blackout (Q8), final table broadcast (E15), instant replay (E16), web push (N4) |

**If the schedule slips:** cut P1 from the bottom of the list above. **Never cut** the Final Lap, the fair timer, the TV board, Mission Control, or the P0 signature effects. These define the event.

## 15. Out of scope

House rules and team play. Free-text chat. Multiple seasons or archives beyond the hall of fame. Native apps. Microsoft 365 SSO (it's the fallback if magic links fail; see architecture ADR-3).

## 16. Open questions (need sign-off)

| # | Question | Owner | Proposed default |
|---|---|---|---|
| 1 | Confirmed event date and time block? | Events | Week of Nov 2, 2-hour block (run-of-show in §7) |
| 2 | Bracket size? | Events | 16 |
| 3 | Can remote employees play qualifiers? | Events | Yes. They're on the leaderboard and count for the Department Cup, but only attendees are seeded. |
| 4 | Prizes: champion, Pick'em winner, Department Cup, Connector? | Events | Handled outside the app. The app announces the winners. |
| 5 | Who are the admins, and who is the MC? | Events | Brian plus 1–2 organizers, and an MC |
| 6 | Name and trademark: "UNO" is a Mattel trademark. Is "Nue Uno" OK for an internal event? | Marketing / Legal | Internal only, original art, confirm the name |
| 7 | Will IT allowlist Firebase sign-in emails (quarantine and Safe Links)? | IT | Test in Week 1 |
| 8 | Keep data after the event? | Events | Keep the hall of fame and aggregate stats. Delete per-game data after 90 days. |
| 9 | Brand assets: logo files, colors, fonts, and permission for a NueSynergy-branded Wild card? | Marketing | Provided by Oct 2 |
| 10 | Can we get an HR roster export (email, name, department)? | HR / People Ops | CSV by Oct 5 |
| 11 | Is a Teams Workflows webhook allowed for a channel? | IT | Yes, in a dedicated #nue-uno channel |
| 12 | What TV or projector is in the event space, what's its resolution, can it play audio, and is the venue Wi-Fi tested? | Facilities | 1080p+ with audio, Wi-Fi tested in the Week 5 dry run |

## 17. Changelog

**v2 (2026-09-23)** addresses the 24 findings in the [v1 review](reviews/PRD-v1-review.md):
- **Added:** Connection Passport, Department Cup, Uno Hours, presence and nudges, Pick'em, crowd reactions, Selection Show, awards, Uno Wrapped, emotes, tutorial and bots, Event Hub, QR check-in, Mission Control, pause and broadcast, TV director, paper fallback, roster, PWA, Teams posts, run-of-show, visual direction, performance budget, instrumentation, launch plan, cut line
- **Changed:** animations promoted from a single P1 story to a P0 signature set with a full [motion spec](design/experience-and-motion.md). Sound promoted from P2 to P1 (off by default). Bots moved from out of scope to P1 (practice only). Quick Match promoted to P0. The anti-collusion rule promoted to P0, with a new 12-turn minimum.
- **Added rules:** the Final Lap time cap, 1.5s animation grace on timers, and a 20s bracket timer
- **Fixed:** the bracket duration contradiction (the run-of-show is now bounded by the Final Lap caps)

**v1 (2026-09-23)** was the initial draft.
