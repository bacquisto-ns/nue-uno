# Nue Uno

A web-based Uno game and tournament system for the NueSynergy **Connections** event.

Employees sign in with their `@nuesynergy.com` email and play **ranked qualifier games** online in the weeks before the event. The qualifier leaderboard **seeds a bracket**, and the bracket is played live on the app during the in-office event. A big-screen view shows the bracket in the office.

> **Status:** planning. The docs below are the source of truth for the build. No application code exists yet.

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

_To be written in Week 1. It will cover `npm install`, `npm run dev` with the Firebase Emulator Suite, and `npm test`._
