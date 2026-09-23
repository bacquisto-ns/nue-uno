# Delivery Plan

Related: [PRD v2 §12, §14](../PRD.md#14-scope-and-cut-line) · [Experience & Motion](../design/experience-and-motion.md) · [Testing & deployment](testing-and-deployment.md)

**Assumptions**
- The event is in the week of **Nov 2, 2026** (to be confirmed).
- Qualifiers open **Oct 14**. The teaser goes out **Oct 8**.
- **Recommended team:** 2 engineers (A = game and backend, B = frontend, effects, and TV) plus a part-time designer for card art, stamps, and the TV look, plus an event lead.
- With **one engineer**, deliver all P0 items and cut P1 items from the bottom of the list in PRD §14. Expect to finish at about Pick'em or the Selection Show.

## Milestones

| Week | Dates | Engineer A (game and backend) | Engineer B (frontend, effects, TV) | Design / Events | Exit criteria |
|---|---|---|---|---|---|
| 0 | Sep 23 – 25 | Review the docs, create the GitHub issues | — | Open questions 1, 2, 5, 6, 9, 10 assigned | PRD v2 approved |
| 1 | Sep 28 – Oct 2 | Monorepo, CI, both Firebase projects (Firestore, RTDB, Secret Manager). **Engine**, including the Final Lap, stats, and bots, with its full test suite. Firestore and RTDB rules with tests. Magic-link email test with IT. | Auth screens, first-run setup, profile and settings. `motion/tokens.ts`, `EventQueue`, Choreographer skeleton, `/dev/effects` gallery. Card SVG pipeline. | Card faces, **Nue Wild**, avatars, fonts. Brand assets from Marketing. | A company user can sign in on dev. Engine coverage ≥ 90%. Emails arrive. |
| 2 | Oct 5 – 9 | Move callables (idempotency, clock, grace, Final Lap, pause), lobby callables, Quick Match, `finishGame` and `results`, roster and approval | Lobby, table, **game UI**, reconnect. **Effects X1–X4, X10, X17** (deal, fan, throw, draw, turn ring, frame-rate governor). Rules sheet. Local practice with bots. | Stamps and card back. **Teaser video recorded from the dev build (Oct 8).** | 4 people finish a casual game on phones and laptops. Practice vs. bots works. |
| 3 | Oct 12 – 16 | Ranked mode, `counts` rules, anti-collusion, leaderboard, Passport, and stats triggers. RTDB presence, `table_forming` nudges, Teams digest, and the Uno Hour announcer. **Prod deploy Oct 12.** | **Effects X5–X9, X11–X13** (color shift, stamps, +4 impact, UNO, Caught, Final Lap, victory, leaderboard motion). Leaderboard, My Qualifier card, Uno Hour countdown, Online now. | Sound sourcing and sprite (P1). Posters with QR codes. | **Qualifiers open Oct 14.** Ranked games update the leaderboard live on prod, and every P0 effect is in the gallery. |
| 4 | Oct 19 – 23 | Bracket: generate, edit, lock, physical tables, check-in (including QR), advancement, overrides, pause and broadcast, inbox takeovers. Pick'em and Department Cup triggers. | Event Hub, QR check-in page, bracket page. **TV:** Bracket Board, ticker, champion ceremony. **Mission Control.** P1: emotes, reactions, sound, Department Cup UI, Passport UI. | TV backgrounds, scene wipe, table signs | A 16-player bot bracket runs end to end on the TV in demo mode |
| 5 | Oct 26 – 30 | Awards, admin stats, printable bracket, load test, bug fixes | P1: Selection Show, player intros, TV director, Pick'em UI, tutorial, PWA, New Connection stamp, ambient table. Accessibility pass. Performance pass on the test devices. | Run-of-show script for the MC. Print the table signs. | **Dry run** with about 8 people on the real TV, with no admin fixes needed. p95 < 500ms. **Qualifiers close Oct 30.** |
| 6 | Nov 2 – event | Code freeze, backups, warm instances | TV rehearsal in the room | Attendance confirmation | Champion crowned, on time |
| +1 | After the event | `buildWrapped`, hall of fame | Wrapped story UI, share card | Survey, recap post | Wrapped is live |

**Effects budget:** about 5 build-days for Engineer B, spread over Weeks 2–4 (PRD §14). Any effect not done by the end of Week 4 is shipped in its **Reduced** version, which is already built as part of every P0 moment.

### Compressed plan (4 weeks)
Weeks 1 and 2 stay the same. Merge Weeks 3 and 4, and open qualifiers on Oct 21 for about 7 days. Keep all P0 items. From P1, keep only sound, Pick'em, and pause/broadcast. The TV uses only the Bracket Board and Champion scenes.

## Work breakdown (GitHub epics)

1. **Foundation:** scaffold, workspaces, CI, Firebase projects, emulators, seed and bot scripts
2. **Auth & identity:** sign-in, roster and approval, first-run setup, profile, settings, admin claim script
3. **Engine:** rules, Final Lap, stats, bots, property tests
4. **Game backend:** move transactions, clock, pause, `finishGame`, cleanup
5. **Lobby & getting players together:** lobby, Quick Match, presence, nudges, invites, rematch, Uno Hours
6. **Game UI**
7. **Motion & sound:** tokens, EventQueue, Choreographer, one file per moment, frame-rate governor, sound, haptics, effects gallery
8. **Qualifiers:** results, leaderboard, anti-collusion, history
9. **Connections:** Passport, Department Cup, New Connection stamp
10. **Bracket & event:** generation, check-in and QR, advancement, Event Hub, match callouts
11. **TV:** scenes, director, Selection Show, reactions layer, awards, champion
12. **Crowd:** Pick'em, reactions, emotes, watching a table
13. **Admin:** Mission Control, players, roster, season, overrides, pause and broadcast, stats, printing
14. **Comms:** Teams integration, inbox
15. **Launch & recap:** load test, dry run, runbook, Wrapped, hall of fame

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Effects work crowds out the core game | Medium | High | A fixed effects budget, Reduced versions built first, effects work on a separate track from the core game, and the PRD §14 cut line |
| Not enough players online for ranked games | Medium | High | Uno Hours, presence, nudges, Teams digests, organizers playing in the kickoff Uno Hour |
| M365 quarantines magic-link emails, or Safe Links breaks them | Medium | High | Test in Week 1, IT allowlist. Fallback: Microsoft sign-in provider (about 1 day). |
| Venue Wi-Fi or TV problems | Medium | High | Test in the room during the Week 5 dry run. Mobile data fallback. Paper bracket (AD9). A spare laptop for the TV. |
| Effects drop frames on older phones | Medium | Medium | The frame-rate governor switches to Reduced automatically. Weekly checks on the test devices. |
| Games run long on event day | Low | High | Final Lap cap. Admin force-start and override. |
| HR roster not provided in time | Medium | Low | `rosterRequired = false` and admins approve manually. Departments come from the picker. |
| Teams webhook not allowed | Medium | Low | Admins post the digest manually from a copyable card on the Stats page |
| Name or trademark concern | Low | Medium | Internal use only, original art, Marketing sign-off (open question 6) |

## Event-day runbook

**Day before**
- [ ] Code freeze. Prod is on the tagged release. `WARM_MOVE_FUNCTIONS` is on.
- [ ] Firestore export (backup) is done.
- [ ] Attendance list reviewed. Draft bracket reviewed. Physical table numbers assigned.
- [ ] TV laptop: Chrome, signed in as an admin, `/tv` open, full screen, sleep off, audio tested. A spare laptop is ready.
- [ ] Table signs (QR codes) placed and tested with a phone. Paper bracket and score sheets printed.
- [ ] MC has the run-of-show (PRD §7). At least 2 admins are on laptops with Mission Control open.

**Event**
- [ ] T–15: TV on the Bracket teaser with the QR code. Broadcast "Open the app and make your Pick'em picks!"
- [ ] Confirm no-shows → `editBracketSeeds` → **lock the bracket**.
- [ ] T+0: **Selection Show** (TV director → Next through the reveals).
- [ ] Each round: tables become ready, then takeovers and TV callouts go out. Players scan the QR code at their table. Watch Mission Control for stuck or disconnected alerts. Use force start after 3 minutes.
- [ ] Breaks: switch the TV to Pick'em and the Department Cup. Broadcast when the next round starts.
- [ ] Problems: **Pause all** for any interruption. Use **restart match game** or **override result**, always with a reason. Use the kill switches if a social feature misbehaves.
- [ ] After the Final: `computeAwards` → TV Awards → Champion. 🎉
- [ ] Open play: switch the season status so Event Hub shows open tables.

**After**
- [ ] Turn off warm instances. Set the season to `complete`.
- [ ] `buildWrapped`, announce Wrapped and the hall of fame, send the survey.
- [ ] Apply data retention per PRD open question 8.
