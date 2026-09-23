# Delivery Plan

Related: [PRD](../PRD.md) · [Testing & deployment](testing-and-deployment.md)

**Assumptions:** event in the week of **Nov 2, 2026** (to be confirmed), 1–2 engineers, and the qualifier window opens **Oct 14**. If the event is sooner (about 4 weeks out), see [Compressed plan](#compressed-plan-4-weeks).

## Milestones

| Week | Dates | Deliverables | Exit criteria |
|---|---|---|---|
| 0 | Sep 23 – 25 | PRD and engineering docs reviewed. Open questions assigned. GitHub repo created. | Stakeholders sign off on the PRD, with open questions 1, 2, 5, and 6 answered |
| 1 | Sep 28 – Oct 2 | Monorepo scaffold, CI, both Firebase projects. **Auth:** magic link, domain restriction, profile. **Engine:** complete rules plus the test suite. **Security rules** plus rules tests. Magic-link email tested with IT. | A company user can sign in on dev. Engine coverage ≥ 90%. Emails are delivered to company inboxes. |
| 2 | Oct 5 – 9 | Move callables with idempotency, `claimTimeout`. Lobby (create, join, leave, start). **Game UI:** hand, pile, opponents, timer, color picker, UNO and Catch, results. Reconnect. | 4 people play a complete casual game on dev, on both phone and laptop |
| 3 | Oct 12 – 16 | Ranked mode, `results`, the leaderboard trigger, leaderboard page, profile stats, anti-collusion, Quick Match. **Prod deploy Oct 12**, practice (casual only). **Qualifiers open Oct 14.** | Ranked games update the leaderboard live on prod |
| 4 | Oct 19 – 23 | Admin: season settings, players, void game. **Bracket:** generate, edit, lock, check-in, `startMatch`, `advanceBracket`, overrides. Bracket page and **TV view**. | A 16-player bracket runs end to end in the emulator with bots |
| 5 | Oct 26 – 30 | Load sanity test. **Dry run** with about 8 people on prod (test season). Polish, animations, accessibility pass, bug fixes. **Qualifiers close Oct 30.** Draft bracket published. | Dry run finishes with no admin intervention. p95 under 500ms. |
| 6 | Nov 2 – event | Code freeze. Firestore backup. Turn on `minInstances`. Run the event. Post-event survey. | Champion crowned 🎉 |

### Compressed plan (4 weeks)
Merge Weeks 2 and 3, so ranked play ships with the first playable release. Shorten qualifiers to about 10 days. Cut the P1 items Quick Match, game history, and animations. Build the TV view as a simple static bracket that refreshes every few seconds.

## Work breakdown (suggested GitHub issues / epics)

1. **Foundation:** repo scaffold, workspaces, lint and typecheck, CI, Firebase projects, emulator setup
2. **Auth & profile:** sign-in, finish sign-in, `RequireAuth`, `saveProfile`, profile page, admin claim script
3. **Engine:** types, deck, setup, actions, UNO, timeouts, ranking, property tests
4. **Game backend:** move transaction helper, callables, events, `finishGame`, cleanup job
5. **Lobby UI**
6. **Game UI:** cards (SVG, colorblind-safe), layout, animations, dialogs
7. **Qualifiers:** results, leaderboard trigger, leaderboard UI, anti-collusion
8. **Bracket:** generation algorithm, admin builder, check-in, advancement, bracket UI, TV view
9. **Admin console**
10. **Launch:** load test, dry run, runbook, comms

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| M365 quarantines magic-link emails, or Safe Links breaks the links | Medium | High | Test in Week 1. Custom sender name. IT allowlists the sender. Fallback: add the Microsoft sign-in provider (about 1 day of work). |
| Office Wi-Fi is unreliable on event day | Medium | High | Test at the venue during the Week 5 dry run. Players can switch to phone data. Timeouts keep games moving. Admins can restart a game. |
| Timeline slips | Medium | High | P0/P1 split. Compressed plan ready. Casual-only fallback, with the bracket seeded manually by an admin. |
| Low qualifier participation | Medium | Medium | Launch announcement, weekly leaderboard emails or Slack posts, and a lunch "Uno hour" |
| Function cold starts cause lag | Low | Medium | `minInstances: 1` on move functions during the qualifier peak and on event day |
| Name or trademark concern ("UNO") | Low | Medium | Internal-only. Original card art. Confirm the name with Marketing (PRD open question 6). |
| A bug corrupts a game mid-bracket | Low | High | Admin `restartMatchGame` and `overrideMatchResult`. Every action is logged, and games can be replayed. |

## Event-day runbook

**Day before**
- [ ] Code freeze is in effect. Prod is on the tagged release.
- [ ] `minInstances: 1` is deployed for the move functions.
- [ ] Firestore export (backup) is complete.
- [ ] Final attendance is confirmed. The draft bracket is reviewed.
- [ ] TV and projector machine tested: signed in, `/tv` open, browser zoom set, sleep turned off.
- [ ] At least 2 admins are signed in on laptops. Admin runbook printed.

**Event**
- [ ] Take attendance. Swap no-shows with `editBracketSeeds`, then **lock the bracket**.
- [ ] Announce: "Open the app → tap **I'm here** on your table banner."
- [ ] Watch `/admin`. Any table stuck in `ready` for more than 3 minutes gets **force start**.
- [ ] If a game breaks, use **restart match game**. If the result is known, use **override result**. Always enter a reason.
- [ ] Final: 3 games. Champion banner on the TV. 🎉

**After**
- [ ] Remove `minInstances`. Set the season to `complete`.
- [ ] Send the survey. Export results for the recap.
- [ ] Schedule data deletion or retention per PRD open question 8.
