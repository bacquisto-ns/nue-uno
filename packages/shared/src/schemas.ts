import { COLORS, type EngineError } from '@nue-uno/engine';
import { z } from 'zod';
import { AVATAR_COLORS, AVATARS } from './constants.js';

/** Request payload schemas for callables (docs/engineering/api.md). Shared by web + functions. */

export const ColorSchema = z.enum(COLORS);
const Id = z.string().min(1).max(128);

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(2, 'Display name must be at least 2 characters')
  .max(24, 'Display name must be at most 24 characters')
  .regex(/^[\p{L}\p{N} .'_-]+$/u, 'Use letters, numbers, spaces, and . \' _ - only');

export const SaveProfileInput = z.object({
  displayName: DisplayNameSchema,
  avatarId: z.enum(AVATARS),
  // .nullish(): the callable SDK serializes undefined fields as null.
  avatarColor: z.enum(AVATAR_COLORS).nullish(),
  department: z.string().trim().min(1).max(60).nullish(),
  attendingEvent: z.enum(['yes', 'no', 'maybe']),
  signatureCard: z
    .enum(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'wild', 'wild4'])
    .nullable()
    .optional(),
  settings: z
    .object({
      effects: z.enum(['full', 'reduced', 'off']),
      sound: z.boolean(),
      haptics: z.boolean(),
      emotesMuted: z.boolean(),
    })
    .partial()
    .optional(),
  /** Sent once when the tutorial is finished (PRD O2); earns the Passport "tutorial" stamp. */
  tutorialDone: z.literal(true).nullish(),
});
export type SaveProfileInput = z.infer<typeof SaveProfileInput>;

// ---- Lobby ----------------------------------------------------------------------------------

export const CreateTableInput = z.object({
  maxSeats: z.number().int().min(2).max(4),
  requestedMode: z.enum(['casual', 'ranked']),
});
export const GameRef = z.object({ gameId: Id });
export const InviteInput = z.object({ gameId: Id, uid: Id });
export const RematchInput = z.object({ fromGameId: Id });

// ---- Moves ----------------------------------------------------------------------------------

const MoveBase = z.object({
  gameId: Id,
  clientMoveId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
});

export const PlayCardInput = MoveBase.extend({
  cardId: Id,
  chosenColor: ColorSchema.optional(),
  declareUno: z.boolean().optional(),
});
export const SimpleMoveInput = MoveBase; // drawCard, passTurn, callUno, leaveGame
export const ChooseColorInput = MoveBase.extend({ color: ColorSchema });
export const CatchUnoInput = MoveBase.extend({ targetUid: Id });
export const ClaimTimeoutInput = z.object({
  gameId: Id,
  expectedVersion: z.number().int().nonnegative(),
});

export type PlayCardInput = z.infer<typeof PlayCardInput>;
export type ChooseColorInput = z.infer<typeof ChooseColorInput>;
export type CatchUnoInput = z.infer<typeof CatchUnoInput>;
export type ClaimTimeoutInput = z.infer<typeof ClaimTimeoutInput>;

export const QuickMatchInput = z.object({}).passthrough();

// ---- Admin ----------------------------------------------------------------------------------

export const RosterRow = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  name: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(60),
  office: z.string().trim().max(60).nullish(),
});
export const ImportRosterInput = z.object({
  rows: z.array(RosterRow).min(1).max(2000),
  replace: z.boolean().optional(),
});
export const ApproveUserInput = z.object({ uid: Id });
/** Moderation (PRD AD1, api.md): fix a name or department, or disable/re-enable an account. */
export const AdminUpdateUserInput = z
  .object({
    uid: Id,
    displayName: DisplayNameSchema.optional(),
    department: z.string().trim().min(1).max(60).nullish(),
    attendingEvent: z.enum(['yes', 'no', 'maybe']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    reason: z.string().trim().min(3, 'Give a short reason').max(300),
  })
  .refine((v) => v.displayName !== undefined || v.department !== undefined || v.attendingEvent !== undefined || v.status !== undefined, {
    message: 'Nothing to change.',
  });
export type RosterRow = z.infer<typeof RosterRow>;

// ---- Event day ------------------------------------------------------------------------------

export const CheckInMatchInput = z.object({ bracketId: Id, matchId: Id });
export const CheckInAtTableInput = z.object({ physicalTable: z.number().int().min(1).max(20) });
export const SubmitPicksInput = z.object({
  bracketId: Id,
  champion: Id.optional(),
  tables: z.record(Id, Id).optional(),
});

/** Machine-readable failure reasons returned in HttpsError details (api.md §1). */
export const ERROR_REASONS = [
  'NOT_SIGNED_IN',
  'NOT_EMPLOYEE',
  'PENDING_APPROVAL',
  'DISABLED',
  'NOT_ADMIN',
  'NOT_SEATED',
  'NOT_HOST',
  'NOT_IN_MATCH',
  'BAD_REQUEST',
  'GAME_NOT_FOUND',
  'MATCH_NOT_FOUND',
  'NO_MATCH_AT_TABLE',
  'STALE_STATE',
  'PAUSED',
  'GAME_FULL',
  'ALREADY_SEATED_ELSEWHERE',
  'NOT_ENOUGH_PLAYERS',
  'DEADLINE_NOT_REACHED',
  'NAME_TAKEN',
  'BRACKET_LOCKED',
  'PICKS_LOCKED',
  'PLAYERS_NOT_PRESENT',
  'CONTENTION',
] as const;
/** Server reasons plus engine rule violations (which carry a friendly `hint`). */
export type ErrorReason = (typeof ERROR_REASONS)[number] | EngineError;
