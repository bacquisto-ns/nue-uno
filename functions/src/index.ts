import { onCall, type CallableOptions } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { approveUserHandler, importRosterHandler } from './admin/roster.js';
import { cleanupStaleGames } from './game/cleanup.js';
import {
  createTableHandler,
  joinTableHandler,
  leaveTableHandler,
  quickMatchHandler,
  startGameHandler,
} from './game/lobby.js';
import {
  callUnoHandler,
  catchUnoHandler,
  chooseColorHandler,
  claimTimeoutHandler,
  drawCardHandler,
  leaveGameHandler,
  passTurnHandler,
  playCardHandler,
} from './game/moves.js';
import {
  onLeaderboardEntryWrittenHandler,
  onResultWrittenHandler,
  onUserWrittenHandler,
} from './derived/recompute.js';
import { saveProfileHandler } from './profile.js';
import { markInboxSeenHandler } from './social/nudges.js';
import { teamsDigest, unoHourAnnouncer } from './social/schedules.js';
import { TEAMS_WEBHOOK_URL } from './teams.js';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Move functions are latency-sensitive: keep one instance warm when WARM_MOVE_FUNCTIONS=true
// (Uno Hours / event day — architecture §6).
const moveOpts: CallableOptions = {
  minInstances: process.env.WARM_MOVE_FUNCTIONS === 'true' ? 1 : 0,
  concurrency: 80,
};

/** Callables — contracts in docs/engineering/api.md. */
export const saveProfile = onCall((req) => saveProfileHandler(req));

export const createTable = onCall((req) => createTableHandler(req));
export const joinTable = onCall((req) => joinTableHandler(req));
export const leaveTable = onCall((req) => leaveTableHandler(req));
export const startGame = onCall((req) => startGameHandler(req));
export const quickMatch = onCall((req) => quickMatchHandler(req));

export const playCard = onCall(moveOpts, (req) => playCardHandler(req));
export const drawCard = onCall(moveOpts, (req) => drawCardHandler(req));
export const passTurn = onCall(moveOpts, (req) => passTurnHandler(req));
export const chooseColor = onCall(moveOpts, (req) => chooseColorHandler(req));
export const callUno = onCall(moveOpts, (req) => callUnoHandler(req));
export const catchUno = onCall(moveOpts, (req) => catchUnoHandler(req));
export const claimTimeout = onCall(moveOpts, (req) => claimTimeoutHandler(req));
export const leaveGame = onCall(moveOpts, (req) => leaveGameHandler(req));

export const importRoster = onCall((req) => importRosterHandler(req));
export const approveUser = onCall((req) => approveUserHandler(req));

export const cleanupStaleGamesDaily = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'America/Chicago' },
  async () => {
    await cleanupStaleGames();
  },
);

export const markInboxSeen = onCall((req) => markInboxSeenHandler(req));

// Derived data (ADR-5): recomputed from source, so re-deliveries and voids converge.
export const onResultWritten = onDocumentWritten('results/{gameId}', (event) =>
  onResultWrittenHandler(event.data?.before.data(), event.data?.after.data()),
);
export const onLeaderboardEntryWritten = onDocumentWritten(
  { document: 'leaderboard/{seasonId}/entries/{uid}', secrets: [TEAMS_WEBHOOK_URL] },
  (event) =>
    onLeaderboardEntryWrittenHandler(event.params.seasonId, event.data?.before.data(), event.data?.after.data()),
);
export const onUserWritten = onDocumentWritten('users/{uid}', (event) =>
  onUserWrittenHandler(event.params.uid, event.data?.after.data()),
);

// Teams + Uno Hours (ADR-8).
export const teamsDigestDaily = onSchedule(
  { schedule: '0 9 * * 1-5', timeZone: 'America/Chicago', secrets: [TEAMS_WEBHOOK_URL] },
  async () => {
    await teamsDigest();
  },
);
export const unoHourAnnouncerJob = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'America/Chicago', secrets: [TEAMS_WEBHOOK_URL] },
  async () => {
    await unoHourAnnouncer();
  },
);
