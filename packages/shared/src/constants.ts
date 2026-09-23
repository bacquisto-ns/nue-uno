export const COMPANY_DOMAIN = 'nuesynergy.com';

/** Client/server check that an address belongs to the company domain (case-insensitive). */
export function isCompanyEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.trim().toLowerCase().lastIndexOf('@');
  return at > 0 && email.trim().toLowerCase().slice(at + 1) === COMPANY_DOMAIN;
}

export const AVATARS = [
  'fox',
  'owl',
  'bear',
  'otter',
  'panda',
  'tiger',
  'koala',
  'penguin',
  'lion',
  'rabbit',
  'wolf',
  'octopus',
] as const;
export type AvatarId = (typeof AVATARS)[number];

export const AVATAR_COLORS = [
  'coral',
  'amber',
  'lime',
  'teal',
  'sky',
  'indigo',
  'violet',
  'rose',
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export const EMOTES = ['nice', 'lol', 'shock', 'fire', 'gg', 'evil', 'eyes', 'salute'] as const;
export type EmoteKey = (typeof EMOTES)[number];

export const REACTIONS = ['fire', 'clap', 'shock', 'party'] as const;
export type ReactionKey = (typeof REACTIONS)[number];

/**
 * Placeholder department list used until the HR roster / config/app.departments is set
 * (PRD open question 10). Admins can edit the list without a deploy.
 */
export const DEFAULT_DEPARTMENTS = [
  'Account Management',
  'Claims',
  'Compliance',
  'Customer Service',
  'Finance',
  'Human Resources',
  'IT',
  'Marketing',
  'Operations',
  'Sales',
  'Other',
] as const;

/** Season defaults — mirrors seasons/{id} in docs/engineering/data-model.md. */
export const DEFAULT_SEASON_SETTINGS = {
  timezone: 'America/Chicago',
  unoHours: [
    { days: [1, 2, 3, 4, 5], start: '12:00', end: '12:45' },
    { days: [1, 2, 3, 4, 5], start: '16:00', end: '16:30' },
  ],
  timers: { casualMs: 30_000, rankedMs: 30_000, bracketMs: 20_000, awayMs: 5_000, graceMs: 1_500 },
  finalLap: { qualifierMin: 20, bracketMin: 12 },
  scoring: {
    pointsByTableSize: { '3': [8, 4, 1], '4': [10, 6, 3, 1] } as Record<string, number[]>,
    bestN: 10,
    minGames: 3,
    maxSameGroupPerDay: 2,
    minTurnsForPoints: 12,
  },
  cup: { topN: 3, participationBonus: 2, participationMinGames: 3 },
  pickem: { tableWinnerPts: 3, championPts: 10 },
  bracketSize: 16,
  finalGames: 3,
} as const;

export type SeasonSettings = typeof DEFAULT_SEASON_SETTINGS;
