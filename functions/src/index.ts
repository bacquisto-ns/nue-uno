import { onCall, type CallableOptions } from 'firebase-functions/v2/https';
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
import { saveProfileHandler } from './profile.js';

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
