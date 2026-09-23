# Testing & Deployment

Related: [Architecture](architecture.md) · [Experience & Motion §11](../design/experience-and-motion.md#11-review-and-qa) · [Delivery plan](delivery-plan.md)

## 1. Test strategy

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| Engine | Vitest + fast-check | Every rule, the Final Lap, stats, turn counting, bot legality, invariants ([game-engine §5](game-engine.md#5-test-plan-vitest--fast-check--90-line-coverage-in-ci)) | ≥ 90% line coverage on PRs |
| Tournament logic | Vitest | Best-N scoring, `counts` rules (12-turn minimum and forfeits), anti-collusion, bracket generation for N = 3…24, the Semifinal split rule, `advanceBracket` recompute, Final standings, Pick'em scoring, Cup formula, award rules, Passport recompute | Required on PRs |
| Firestore rules | `@firebase/rules-unit-testing` | Every row of the [access table](architecture.md#5-security-model-summary). Pending users, no reading other players' hands, `private/*`, or inboxes, and all client writes denied. | Required on PRs |
| RTDB rules | `@firebase/rules-unit-testing` (database) | Own node only, allowed values only, emote and reaction rate limits, `active` claim required | Required on PRs |
| Functions integration | Vitest + emulators (Auth, Firestore, Database, Functions) | Every callable's success and error paths. Idempotency. Concurrent `claimTimeout`s → exactly one timeout. **Final Lap triggered by the clock** (injected fake clock). **Pause/resume shifts deadlines.** Roster activation. Quick Match prefers unmet opponents. Trigger chain: result → leaderboard → Cup, result → Passport and stats, match complete → Pick'em. `checkInAtTable` resolution. `table_forming` nudges respect the 2-minute limit. | Required on PRs |
| Web components | Vitest + React Testing Library | Hand playability, color picker, UNO and Catch buttons, turn ring timing (starts after the animation queue empties), `EventQueue` fast-forward rules, effect mode switching | Required on PRs |
| Effects | Playwright on `/dev/effects` | Final-frame visual snapshot of each moment in Full, Reduced, and Off. An assertion that input stays enabled during every effect. | Required on PRs that touch `motion/` |
| End-to-end | Playwright against emulators | (1) Sign in with an email link, first-run setup, lobby. (2) Two browser contexts play a full seeded game to the end. (3) A Final Lap game with the fake clock. (4) Admin generates and locks a bracket, players check in with QR `/table/1`, the TV shows advancement. (5) The tutorial completes. | Required before merging to `main` |
| Performance | Lighthouse CI on the lobby. A manual trace on the test devices. | Lobby JS ≤ 250 KB gzipped, largest paint < 2.5s on 4G. 60fps during the X3 and X7 effects on an iPhone 12 and Pixel 6a. | Budget checked in CI. Device check weekly from Week 3. |
| Load | `scripts/loadtest.ts` against **dev**. It uses the engine's `botAction` through real callables. | 12 tables × 4 bots plus 40 simulated spectators (Firestore listeners and RTDB reactions) for 15 minutes. Measures p95 time from call to snapshot. | Week 5. Target p95 < 500ms. |
| Event dry run | Real people and the real TV | About 8 players, a full 2-round bracket, Selection Show, Pick'em, reactions, pause/resume, awards | Week 5 |

**A fake clock for tests:** functions read time through `clock.now()`. In the emulator only, `NUE_UNO_TEST_CLOCK_OFFSET_MS` can be changed through a test-only HTTP endpoint (not deployed to prod), so tests can jump to the Final Lap or past a deadline.

**Fixed seeds:** in the emulator only, `NUE_UNO_TEST_SEED` makes the deal predictable.

**Email link in tests:** read the link from the Auth emulator's `/emulator/v1/projects/{id}/oobCodes` endpoint.

## 2. Local development

```bash
npm install
npm run emulators      # auth, firestore, database, functions, hosting; --import/--export-on-exit ./emulator-data
npm run dev            # Vite; connects to emulators when VITE_USE_EMULATORS=true
npm test               # engine + shared + web + functions (via emulators:exec)
npm run seed:dev       # season, roster, 16 fake users, sample results, a draft bracket
npm run bots -- --tables 3   # fills lobbies with bot-driven players against the local emulators (demo / TV development)
```

Open `/dev/effects` for the effects gallery and `/tv?demo=1` for the TV with bot-driven tables.

## 3. Environments

| | Dev | Prod |
|---|---|---|
| Firebase project | `nue-uno-dev` | `nue-uno-prod` |
| Services | Hosting, Auth, Firestore (`nam5`), RTDB (`us-central1`), Functions, Secret Manager | Same |
| Plan and budget alert | Blaze, $10 | Blaze, $25 |
| URL | `nue-uno-dev.web.app` + PR previews | `nue-uno-prod.web.app` (optional custom domain, e.g. `uno.nuesynergy.com`) |
| Roster | A fake roster CSV | The real HR roster, imported through the admin UI and **never committed** |
| Teams webhook | A test channel | `#nue-uno` |

Web config values are not secrets and come from GitHub **variables** (`VITE_FIREBASE_*`, `VITE_DATABASE_URL`). Server secrets live in Secret Manager: `TEAMS_WEBHOOK_URL`.

### One-time setup (per project)
1. Create the project and switch to Blaze. Set the budget alert.
2. Create Firestore (Native, `nam5`) and the Realtime Database (`us-central1`).
3. Turn on the Auth email-link sign-in method, email enumeration protection, and the authorized domains. Customize the email template (sender "Nue Uno"). Ask IT to allowlist the sender.
4. Register the Web app, and copy its config into the GitHub variables.
5. `firebase functions:secrets:set TEAMS_WEBHOOK_URL`.
6. Deploy (below). Run `scripts/grant-admin.ts <email>` for each admin. Run `scripts/seed.ts --prod-init` to create `config/app` and the season.
7. Import the roster in Admin → Roster (CSV).

## 4. CI/CD (GitHub Actions)

**GCP authentication:** Workload Identity Federation (`google-github-actions/auth`) with one deploy service account per project. Roles: Firebase Hosting Admin, Cloud Functions Admin, Firebase Rules Admin, Cloud Datastore Index Admin, Firebase Realtime Database Admin, Secret Manager Secret Accessor, Service Account User, Artifact Registry Writer, Cloud Scheduler Admin. The fallback is a JSON key stored as a secret.

### `.github/workflows/ci.yml` (pull requests)
```yaml
jobs:
  test:
    steps:
      - checkout; setup-node 22 (npm cache); setup-java 21 (emulators)
      - npm ci
      - npm run lint && npm run typecheck
      - npm test -- --coverage
      - npm run build && npm run size   # bundle budget check
      - npx playwright install --with-deps && npm run e2e && npm run e2e:effects
  preview:
    needs: test
    steps:
      - build web with dev variables
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with: { projectId: nue-uno-dev, channelId: pr-${{ github.event.number }}, expires: 7d }
```
Previews use the **dev** backend. Magic-link sign-in works on a preview URL only if that domain has been authorized. Otherwise test sign-in on `nue-uno-dev.web.app`. The effects gallery and TV demo mode work on previews without signing in when built with `VITE_DEMO=true`.

### `.github/workflows/deploy.yml` (push to `main` → dev; tag `v*` → prod)
```yaml
jobs:
  deploy:
    environment: ${{ startsWith(github.ref, 'refs/tags/v') && 'prod' || 'dev' }}   # prod requires approval
    steps:
      - checkout; setup-node 22; npm ci; npm test; npm run build
      - google-github-actions/auth (WIF)
      - npx firebase-tools deploy --project $ALIAS \
          --only firestore:rules,firestore:indexes,database,functions,hosting --force
```
- The `prod` GitHub Environment requires a reviewer's approval.
- **Code freeze** starts the day before the event. Only hotfixes approved by the event lead are allowed.
- Changing `WARM_MOVE_FUNCTIONS` (minInstances) is a config-only redeploy of the move functions.

## 5. Monitoring and rollback

- **Hosting:** roll back from the console's release history in seconds.
- **Functions:** redeploy the previous tag.
- **Kill switches:** `config/app.features` turns off emotes, reactions, Pick'em, nudges, or sound instantly, with no deploy, if something misbehaves at the event.
- **Alerts:** function error rate > 2% over 5 minutes, and p95 execution time > 1s. Both go to the event lead.
- **Mission Control** is the monitor people watch on event day (stuck tables, disconnects).
- **Logs:** structured, searchable by `gameId`. Mission Control links each table to its log query.
