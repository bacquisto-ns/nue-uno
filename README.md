# Nue Uno

A web-based Uno game and tournament system for the NueSynergy **Connections** event.

Employees sign in with their `@nuesynergy.com` email and play **ranked qualifier games** online in the weeks before the event. The qualifier leaderboard **seeds a bracket**, and the bracket is played live on the app during the in-office event. A big-screen view shows the bracket in the office.

> **Status:** Week 2 (game loop). Sign-in, profiles, lobby, Quick Match, live server-validated games, practice vs bots and the rules sheet work end-to-end against the emulators. Ranked leaderboard lands in Week 3. See the [delivery plan](docs/engineering/delivery-plan.md).

## Documentation

| Doc | What it covers |
|---|---|
| [PRD (v2)](docs/PRD.md) | Goals, personas, user stories, acceptance criteria, run-of-show, metrics, cut line, open questions |
| [Experience & Motion spec](docs/design/experience-and-motion.md) | Motion tokens, the moment catalog (animations, sound, haptics), TV broadcast package, performance budget |
| [PRD v1 review](docs/reviews/PRD-v1-review.md) | Critical review of v1: 24 findings and the engineering-doc follow-ups |
| [Architecture](docs/engineering/architecture.md) | Stack, system diagram, key decisions (server-authoritative play, auth, timeouts) |
| [Data model](docs/engineering/data-model.md) | Firestore collections, fields, indexes, security rules |
| [Game engine](docs/engineering/game-engine.md) | Uno rules spec, state machine, pure-TypeScript engine API |
| [API](docs/engineering/api.md) | Cloud Function contracts, error codes, idempotency |
| [Tournament](docs/engineering/tournament.md) | Qualifier scoring, eligibility, seeding, bracket algorithm |
| [Testing & deployment](docs/engineering/testing-and-deployment.md) | Test strategy, emulators, environments, CI/CD |
| [Delivery plan](docs/engineering/delivery-plan.md) | Week-by-week milestones, risks, event-day runbook |

## Stack at a glance

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, hosted on **Firebase Hosting**
- **Auth:** Firebase Authentication, **email link (magic link)**, limited to `@nuesynergy.com`
- **Data:** Cloud Firestore (system of record) + Realtime Database (presence, emotes, reactions)
- **Game server:** Cloud Functions for Firebase (2nd gen, TypeScript), which run a shared pure game engine
- **Code:** GitHub monorepo (npm workspaces); CI/CD with GitHub Actions

## Planned repo layout

```
apps/web/            React SPA
functions/           Cloud Functions (callable API + triggers)
packages/engine/     Pure TS Uno engine (shared by web + functions)
scripts/             Admin/ops scripts (grant admin, seed data)
docs/                PRD + engineering docs
firebase.json, firestore.rules, firestore.indexes.json, .firebaserc
.github/workflows/   CI + deploy
```

## Quickstart

Prereqs: **Node 22+**, **Java 21** (for the Firebase emulators), and the Firebase CLI (`npm i -g firebase-tools`).

```bash
npm install
npm run emulators      # Auth, Firestore, Realtime DB, Functions + Emulator UI at http://localhost:4000
npm run dev            # in a second terminal → http://localhost:5173
```

Everything runs locally against the `demo-nue-uno` emulator project — no Firebase account needed.
To sign in, enter any `@nuesynergy.com` address, then open the sign-in link from
**Emulator UI → Authentication** (or `http://127.0.0.1:9099/emulator/v1/projects/demo-nue-uno/oobCodes`).

| Command | What it does |
|---|---|
| `npm test` | Engine (≥ 90% coverage gate), shared, functions (against emulators), web |
| `npm run test:rules` | Firestore + Realtime Database security-rules tests |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript across all workspaces |
| `npm run build` | Bundle functions (esbuild) and the web app (Vite) |
| `npm run ci` | Everything CI runs |

Grant an admin: `node scripts/grant-admin.ts someone@nuesynergy.com --project <project-id>`
(set `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` to target the emulator).

Play a real multiplayer game locally: create a table in the browser, then add a scripted opponent with
`npm run bot -- <gameId> Bella` (it joins through the real callables and plays with the engine's bot policy).

Try the effects: open **/dev/effects** — deal, fan, throw and draw with Full / Reduced / Off modes.
