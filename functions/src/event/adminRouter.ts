import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { approveUserHandler, importRosterHandler } from '../admin/roster.js';
import { fail } from '../errors.js';
import { parse, requireAdmin } from '../guards.js';
import {
  broadcastHandler,
  clearBroadcastHandler,
  editBracketSeedsHandler,
  generateBracketHandler,
  lockBracketHandler,
  overrideMatchResultHandler,
  pauseAllHandler,
  restartMatchGameHandler,
  resumeAllHandler,
  setPhysicalTablesHandler,
  setSeasonHandler,
  setTvSceneHandler,
  startMatchHandler,
  voidGameHandler,
} from './callables.js';
import { adminStatsHandler, computeAwardsHandler } from './insights.js';

type Req = Pick<CallableRequest<unknown>, 'auth' | 'data'>;
type Handler = (req: Req) => Promise<unknown>;

/**
 * All admin actions behind one callable (`admin`, `{ action, payload }`). Each Cloud Function is its
 * own Cloud Run service reserving regional CPU quota, so bundling the rarely-used admin tools keeps
 * the project well inside a new project's 20 vCPU limit. Each handler still checks the admin claim.
 */
const ACTIONS: Record<string, Handler> = {
  importRoster: importRosterHandler,
  approveUser: approveUserHandler,
  generateBracket: generateBracketHandler,
  editBracketSeeds: editBracketSeedsHandler,
  setPhysicalTables: setPhysicalTablesHandler,
  lockBracket: lockBracketHandler,
  startMatch: startMatchHandler,
  overrideMatchResult: overrideMatchResultHandler,
  restartMatchGame: restartMatchGameHandler,
  voidGame: voidGameHandler,
  pauseAll: pauseAllHandler,
  resumeAll: resumeAllHandler,
  broadcast: broadcastHandler,
  clearBroadcast: clearBroadcastHandler,
  setTvScene: setTvSceneHandler,
  setSeason: setSeasonHandler,
  computeAwards: computeAwardsHandler,
  adminStats: adminStatsHandler,
};

export const ADMIN_ACTIONS = Object.keys(ACTIONS);

const RouterInput = z.object({ action: z.string().min(1).max(64), payload: z.unknown().optional() });

export async function adminRouter(req: Req): Promise<unknown> {
  requireAdmin(req);
  const { action, payload } = parse(RouterInput, req.data);
  const handler = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : undefined;
  // Usually a web build newer than the deployed functions.
  if (!handler) throw fail('invalid-argument', 'BAD_REQUEST', `Unknown admin action "${action}". The server may be out of date: redeploy functions.`);
  return handler({ auth: req.auth, data: payload ?? {} });
}
