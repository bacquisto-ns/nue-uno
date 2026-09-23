# Testing & Deployment

Related: [Architecture](architecture.md) · [Delivery plan](delivery-plan.md)

## 1. Test strategy

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| Engine unit + property tests | Vitest + fast-check | Every rule in [game-engine.md §5](game-engine.md#5-test-plan-vitest--90-line-coverage-required-in-ci) | ≥ 90% line coverage, required on PRs |
| Tournament logic | Vitest | Scoring and best-N, anti-collusion `groupKey`, bracket generation for N = 3…24, cross-pairing constraint, `advanceBracket` recompute, final standings | Required on PRs |
| Security rules | `@firebase/rules-unit-testing` + Firestore emulator | Each row of the access table. A player can't read another player's hand or `private/*`. A non-company or unverified account is denied everything. All client writes are denied. | Required on PRs |
| Functions integration | Vitest + Auth/Firestore/Functions emulators | Every callable's success and error paths. Idempotency: a duplicate `clientMoveId` gives a no-op, and a stale `expectedVersion` is rejected. Concurrent `claimTimeout` calls result in exactly one timeout. A finished game writes `results`, and the trigger updates the leaderboard. | Required on PRs |
| Web components | Vitest + React Testing Library | Card playability highlighting, color picker, UNO and Catch buttons, the timer | Required on PRs |
| End-to-end smoke | Playwright against emulators | Two browser contexts sign in (emulator email link), create a table, join, and play a full seeded game to the end. Also covers the TV page render and admin bracket generation. | Required before merging to `main` |
| Load sanity | Node script against the **dev** project | 12 simulated tables × 4 bots playing random legal moves at the same time for 10 minutes. Records the p95 time from callable to snapshot. | Run once in Week 5. The target is p95 < 500ms. |
| Event dry run | Real people | About 8 people, a full 2-round bracket on prod with a test season | Week 5 |

**Deterministic tests:** the functions take the seed from `crypto.randomInt`, but tests inject a fixed seed through `process.env.NUE_UNO_TEST_SEED` (the emulator only), so e2e tests can script exact hands.

**Email link in tests:** the Auth emulator exposes sign-in links at `http://localhost:9099/emulator/v1/projects/{id}/oobCodes`. Playwright reads the link from there and opens it.

## 2. Local development

```bash
npm install                 # root; installs all workspaces
npm run emulators           # firebase emulators:start --import=./emulator-data --export-on-exit
npm run dev                 # vite dev server; web app auto-connects to emulators when import.meta.env.DEV
npm test                    # all workspaces (engine, functions w/ emulators:exec, web)
npm run seed:dev            # scripts/seed.ts: creates season, 12 fake users, sample results
```

`apps/web/src/firebase.ts` calls `connectAuthEmulator`, `connectFirestoreEmulator`, and `connectFunctionsEmulator` when `VITE_USE_EMULATORS=true`.

## 3. Environments

| | Dev | Prod |
|---|---|---|
| Firebase project | `nue-uno-dev` | `nue-uno-prod` |
| Plan | Blaze (budget alert $10) | Blaze (budget alert $25) |
| Hosting URL | `nue-uno-dev.web.app` + PR preview channels | `nue-uno-prod.web.app` (optionally a custom domain, e.g. `uno.nuesynergy.com`) |
| Auth authorized domains | `localhost`, dev web.app/firebaseapp.com, preview-channel domains as needed | prod web.app/firebaseapp.com + custom domain |
| Data | Seeded fake data, can be wiped | Real players |

`.firebaserc` defines both projects under the aliases `dev` and `prod`. Web config values (apiKey, and so on) aren't secrets. They're injected at build time from `VITE_FIREBASE_*` variables stored as GitHub **variables**, one set per environment.

### One-time Firebase setup checklist (per project)
1. Create the project and upgrade it to Blaze. Set the budget alert.
2. Create the Firestore database in Native mode with location `nam5`.
3. Authentication → Sign-in method → **Email/Password**, and turn on **Email link (passwordless sign-in)**.
4. Authentication → Settings: turn on **email enumeration protection**, and add the authorized domains.
5. Authentication → Templates: set the sender name to "Nue Uno" and customize the email-link template text. Ask IT to allowlist the sender. (See [PRD open question 7](../PRD.md#10-open-questions-need-sign-off).)
6. Register a Web app and copy its config into the GitHub variables.
7. Deploy the rules, indexes, and functions (see below). Run `scripts/grant-admin.ts <email>` for each admin.
8. Create `config/app` and the season doc with `scripts/seed.ts --prod-init`.

## 4. CI/CD (GitHub Actions)

**Authentication to GCP:** use **Workload Identity Federation** (`google-github-actions/auth`) with a deploy service account per project. Its roles: Firebase Hosting Admin, Cloud Functions Admin, Firebase Rules Admin, Cloud Datastore Index Admin, Service Account User, and Artifact Registry Writer. This means no JSON keys are stored in GitHub. If WIF setup blocks us, the fallback is a JSON key stored as `FIREBASE_SERVICE_ACCOUNT_{DEV,PROD}` secrets.

### `.github/workflows/ci.yml` — on pull request
```yaml
jobs:
  test:
    steps:
      - checkout; setup-node 22 (cache npm); setup-java 21 (Firestore emulator)
      - npm ci
      - npm run lint && npm run typecheck
      - npm test -- --coverage          # runs engine, web, and functions via firebase emulators:exec
      - npm run build
      - npx playwright install --with-deps && npm run e2e
  preview:
    needs: test
    steps:
      - build web with dev VITE_FIREBASE_* vars
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with: { projectId: nue-uno-dev, channelId: pr-${{ github.event.number }}, expires: 7d }
```
Previews point at the **dev** backend. Magic-link sign-in on a preview URL only works if that preview domain is added to authorized domains. Otherwise, test sign-in on `nue-uno-dev.web.app` or locally.

### `.github/workflows/deploy.yml` — on push to `main` (dev) and on tag `v*` (prod)
```yaml
jobs:
  deploy:
    environment: ${{ startsWith(github.ref, 'refs/tags/v') && 'prod' || 'dev' }}   # prod env requires manual approval
    steps:
      - checkout; setup-node 22; npm ci; npm test; npm run build
      - google-github-actions/auth (WIF)
      - npx firebase-tools deploy --project $ALIAS --only firestore:rules,firestore:indexes,functions,hosting --force
```
- The GitHub **Environment** `prod` requires a reviewer to approve, so there are no accidental prod deploys.
- Freeze prod deploys from the day before the event until it's over, except for hotfixes approved by the event lead.

## 5. Monitoring and rollback

- **Hosting rollback:** use Firebase console → Hosting → release history → Rollback. It takes seconds.
- **Functions rollback:** redeploy the previous tag (`git checkout vX && deploy`).
- **Alerts:** Cloud Monitoring alert on function error rate > 2% over 5 minutes, and on p95 execution time > 1s. They notify the event lead's email.
- **Logs:** structured logs are searchable by `gameId`. The admin UI links each game to its log query.
