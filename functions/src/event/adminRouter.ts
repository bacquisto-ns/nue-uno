import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { approveUserHandler, importRosterHandler } from '../admin/roster.js';
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
};

export const ADMIN_ACTIONS = Object.keys(ACTIONS);

const RouterInput = z.object({ action: z.enum(Object.keys(ACTIONS) as [string, ...string[]]), payload: z.unknown().optional() });

export async function adminRouter(req: Req): Promise<unknown> {
  requireAdmin(req);
  const { action, payload } = parse(RouterInput, req.data);
  return ACTIONS[action]!({ auth: req.auth, data: payload ?? {} });
}
