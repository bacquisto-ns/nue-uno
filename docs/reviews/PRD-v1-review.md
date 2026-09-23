# PRD v1 — Critical Review

| | |
|---|---|
| **Reviewed** | [PRD v1](../PRD.md) (commit `3e4e3f2`) |
| **Date** | 2026-09-23 |
| **Outcome** | 24 findings. All are addressed in [PRD v2](../PRD.md). The follow-up changes needed in the engineering docs are listed at the end. |

**Severity:** 🔴 High means it could make the event fail or undermine its purpose. 🟠 Medium means a noticeably worse experience or extra risk. 🟡 Low is polish or clarity.

## Summary

The first draft is a solid spec for **a working Uno game with a leaderboard**. It is a weak spec for **a Connections event**. Its biggest gaps:

1. **It never designs for connection.** "Connection" is Goal #1, but nothing in the product helps people meet coworkers outside their own team. It's only measured afterwards, in a survey.
2. **The ranked mode may not have enough players online at once.** With fewer than 50 people spread across schedules, finding 3 others free at the same moment is the biggest adoption risk, and v1 has nothing to address it.
3. **Most of the room has nothing to do on event day.** About 34 of ~50 people aren't in the bracket. v1 gives them a passive TV screen and nothing else.
4. **The event schedule depends on games of unknown length.** An Uno game has no time limit, so the bracket's 75–90 minute estimate can't be relied on.
5. **Animation and "feel" are an afterthought.** Animations are a single P1 story and sound is P2. For an event product, how it feels to play *is* the product.

## Findings

### Purpose and engagement

| # | Finding | Sev | Why it matters | v2 resolution |
|---|---|---|---|---|
| 1 | Nothing in the product actively creates cross-team connections | 🔴 | Goal G1 isn't built into anything; we'd find out whether it happened only from the post-event survey | **Connection Passport**: a stamp for each new coworker and department you play with, plus a "Connector" award. Profiles include department. Matchmaking prefers new opponents. Metric: unique cross-department pairs. |
| 2 | Not enough players online at once for ranked games | 🔴 | Ranked needs 3+ people at the same time. Empty lobbies make people give up quickly. | **Uno Hours** (scheduled daily play windows with a countdown in the lobby), an **Online now** presence list, a "Table forming — 1 seat left" toast shown to everyone online, Teams channel posts, and invite links |
| 3 | No role for non-bracket attendees on event day | 🔴 | Most of the room would just watch a TV | **Pick'em predictions** with their own leaderboard, **crowd reactions** that float up on the TV, open casual tables during the event, and a **Department Cup** |
| 4 | No onboarding or rules help | 🟠 | Many employees haven't played in years or only know house rules (stacking) and will think the game is broken | A **rules page**, an **interactive tutorial against bots**, and **practice vs. bots** |
| 5 | No shared-experience moments before the event | 🟠 | The build-up drives attendance and participation | A **Selection Show** (animated seeding reveal on event morning), a **leaderboard blackout** for the final 24h (P2), and daily leaderboard posts to Teams |
| 6 | No post-event recap | 🟡 | Loses the chance to celebrate and to show that the connection goal worked | **Uno Wrapped**: a personal stats card, event superlatives, and a hall of fame |

### Event-day operations

| # | Finding | Sev | Why it matters | v2 resolution |
|---|---|---|---|---|
| 7 | Games have no time limit | 🔴 | A single long game (20+ min) delays the whole event. v1 also gives two different estimates (PRD says 60–75 min, tournament.md says 75–90). | A **Final Lap** time cap: each bracket game is capped at 12 min, then every player gets one last turn and placements are decided by cards left. Bracket length is now at most about 80 minutes. |
| 8 | Turn timer and animations compete | 🟠 | A 30s deadline that starts while a 1s animation is still playing costs players time and feels unfair | Animation grace: the deadline = turn length + 1.5s, and the visible countdown starts only after the animation finishes |
| 9 | No way to pause the tournament or broadcast to players | 🟠 | Speeches, fire drills, and lunch all interrupt an event | Admin **Pause all** (freezes every deadline) and **Broadcast** (a banner on every screen plus the TV) |
| 10 | No overview for running the event | 🟠 | Admins need to spot stuck tables immediately | **Mission Control**: a live grid of every table with alerts for stuck or idle tables and one-click fixes |
| 11 | No link between the app and the physical room | 🟠 | People need to know where to sit and how to join | Physical table signs with **QR codes** for check-in, and a QR code on the TV to open the app |
| 12 | No backup if the platform fails | 🟠 | Firebase outage or Wi-Fi failure means no bracket | A **printable bracket** plus a paper fallback procedure. Admin overrides can enter results played on physical cards. |
| 13 | Nothing notifies a bracket player when their table is ready | 🟠 | If their phone is locked, they miss it | Installable app (**PWA**), a TV callout, and MC script prompts. Web push is P2 because on iOS it only works for installed web apps. |

### Integrity and fairness

| # | Finding | Sev | Why it matters | v2 resolution |
|---|---|---|---|---|
| 14 | Players can quit to hand a friend the win | 🟠 | Three friends can quit on turn 2 and give the fourth 10 points | Ranked points are paid only if the game lasted at least 12 turns. A player who quits still gets their last-place result. |
| 15 | Shared or second company mailboxes (e.g. `info@`) allow extra accounts | 🟠 | One person could play as two | Import the **HR roster** (list of employee emails). Accounts not on the roster need admin approval. The roster also fills in name and department. |
| 16 | Qualifier times don't account for time zones | 🟡 | Remote staff could misread the close time | All times shown in the viewer's local time zone, with a countdown |

### Experience quality

| # | Finding | Sev | Why it matters | v2 resolution |
|---|---|---|---|---|
| 17 | Animations are P1 and sound is P2 | 🔴 | How the game feels is what makes it memorable and fun to show off; a static card game looks unfinished | A full **Experience & Motion spec**, with a P0 set of signature moments (see [experience-and-motion.md](../design/experience-and-motion.md)) |
| 18 | No brand or visual direction | 🟠 | Designers and developers would each pick their own style | Visual direction: a dark "arcade felt" table, a NueSynergy-branded card back, and a custom **Nue Wild** card |
| 19 | No reduced-motion or sound etiquette rules | 🟠 | Heavy effects can trigger motion sensitivity, and surprise sounds in an open office are a problem | Respect `prefers-reduced-motion`, an in-app Effects: Full / Reduced / Off setting, and **sound off by default** |
| 20 | No performance budget for effects | 🟠 | Effects that drop frames on mid-range phones feel worse than no effects | 60fps target on an iPhone 12 or Pixel 6a class phone, a size limit for the app's code, and effects that scale down automatically |
| 21 | No quick emotes between players | 🟡 | Banter is where connection happens. Free-text chat needs moderation; fixed emotes don't. | Fixed **emote reactions** in game (8 emotes, rate-limited) |
| 22 | Profile is minimal (preset avatars only) | 🟡 | Identity drives investment in the game | Avatar color and frame, department, a "signature card" (a favorite card shown on your intro), and a walk-out intro card for bracket players |

### Spec hygiene

| # | Finding | Sev | Why it matters | v2 resolution |
|---|---|---|---|---|
| 23 | No way to measure the success metrics | 🟠 | Targets exist, but nothing collects the data | An **Instrumentation** section with metrics derived from Firestore and a small admin stats page |
| 24 | Scope risk isn't discussed | 🔴 | v1's P0 list is already about a full 5 weeks for 1–2 engineers. Adding impressive features could sink the core game. | A **cut line**: must-have (P0), should-have (P1), and nice-to-have (P2), plus a "wow budget". Signature effects get about 5 build-days. Anything that isn't P0 is cut first if the core slips. |

## Follow-up changes to the engineering docs

These become necessary once v2 is approved. They are **not yet applied**:

| Doc | Change |
|---|---|
| `architecture.md` | Add Realtime Database for presence (its disconnect detection is the standard Firebase approach). Add a Teams notification integration (Teams Workflows webhook) run from a Firestore trigger. Add a PWA manifest and service worker. Add the effects stack (Framer Motion, `canvas-confetti`, Howler.js). |
| `data-model.md` | Add to `users`: `department`, `avatarColor`, `signatureCard`, `settings` (effects/sound). New collections: `roster`, `passport/{uid}`, `picks`, `reactions` (short-lived), `announcements`, `awards`. Add to `games`: `finalLapAt`, `turnCount`, `paused`. |
| `game-engine.md` | Add a Final Lap action and state, an animation grace period on deadlines, pause/resume, and a bot policy (a simple heuristic player for practice and the tutorial). |
| `api.md` | Add `sendEmote`, `sendReaction`, `submitPicks`, `pauseAll` / `resumeAll`, `broadcast`, `importRoster`, `approveUser`, `startPracticeGame`. |
| `tournament.md` | Add the Final Lap cap, the 12-turn minimum for ranked points, pick'em scoring, Department Cup scoring, and the Passport. |
| `delivery-plan.md` | Rebalance the schedule around the wow budget. Add a design and sound-sourcing task in Week 1. Add a TV and Selection Show rehearsal. |
